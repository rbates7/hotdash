// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CACHE_TTL_MS,
  RETRY_AFTER_MS,
  createGitHubLoader,
  createWorkboardService,
  failureKind,
  readWorkboardConfig,
  type Loader,
} from "@/lib/server/workboard"
import { SYNC_TIMEOUT_MS } from "@/lib/server/time-limit"
import type { WorkboardItem } from "@/lib/workboard"

/** A fake token: shaped like GitHub's, valid nowhere. */
const TOKEN = "ghp_hotdashUnitTestOnly0000000000000"
const ENV = { GITHUB_READONLY_TOKEN: TOKEN }
const NOW = new Date("2026-10-16T12:00:00.000Z")

const ITEM: WorkboardItem = {
  number: 1,
  title: "One",
  url: "https://github.com/rbates7/hotdash/pull/1",
  owner: "rbates7",
  state: "ready_for_review",
  ci: "passing",
  review: "none",
  updatedAt: "2026-10-16T11:00:00Z",
  mergedAt: null,
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

function service(load: Loader, env: Record<string, string | undefined> = ENV) {
  const log = vi.fn()
  return { svc: createWorkboardService({ env: () => env, load, log }), log }
}

describe("readWorkboardConfig", () => {
  it("is missing with no token, invalid unless word characters only", () => {
    expect(readWorkboardConfig({})).toEqual({ kind: "missing" })
    expect(readWorkboardConfig({ GITHUB_READONLY_TOKEN: "  " })).toEqual({ kind: "missing" })
    for (const bad of ["ghp_CI-DUMMY-not-a-real-token-4b2e8d", "ghp_abc def0000000000000000", "short", "a\nb".repeat(10)]) {
      expect(readWorkboardConfig({ GITHUB_READONLY_TOKEN: bad })).toEqual({ kind: "invalid" })
    }
    expect(readWorkboardConfig(ENV)).toEqual({ kind: "ok", token: TOKEN })
    expect(readWorkboardConfig({ github_read_only: TOKEN })).toEqual({ kind: "ok", token: TOKEN })
    expect(readWorkboardConfig({ GITHUB_READONLY_TOKEN: TOKEN, github_read_only: "other_token_value_xxxxxxxx" })).toEqual({
      kind: "ok",
      token: TOKEN,
    })
  })
})

const NOT_CONNECTED = { status: "not_connected", connected: false, fetchedAt: NOW.toISOString(), stale: false, items: [] }

describe("not connected", () => {
  it("no token (or an unusable one): not_connected, never connecting, no items, nothing loaded", async () => {
    const load = vi.fn<Loader>(async () => [ITEM])
    for (const env of [{}, { GITHUB_READONLY_TOKEN: "not a token" }, { github_read_only: "short" }]) {
      const { svc } = service(load, env)
      expect(await svc.read()).toEqual({ ...NOT_CONNECTED, fetchedAt: new Date().toISOString() })
      // Still not connecting on a later read, or after time passes.
      vi.advanceTimersByTime(RETRY_AFTER_MS)
      expect((await svc.read()).status).toBe("not_connected")
    }
    expect(load).not.toHaveBeenCalled()
  })
})

describe("status (the Stripe rule, src/lib/server/stripe.ts)", () => {
  it("cold start with a token is connecting, then connected once the first sync lands", async () => {
    let land!: (items: WorkboardItem[]) => void
    const load = vi.fn<Loader>(() => new Promise((r) => (land = r)))
    const { svc } = service(load)
    expect(await svc.read()).toEqual({ ...NOT_CONNECTED, status: "connecting" })
    expect((await svc.read()).status).toBe("connecting")
    land([ITEM])
    await svc.settled()
    expect(await svc.read()).toEqual({ status: "connected", connected: true, fetchedAt: NOW.toISOString(), stale: false, items: [ITEM] })
  })

  it("a 401 on the first sync is not_connected, and the retry is never connecting again", async () => {
    const load = vi.fn<Loader>(() => Promise.reject(Object.assign(new Error("401"), { type: "GitHubHttpError" })))
    const { svc } = service(load)
    expect((await svc.read()).status).toBe("connecting")
    await svc.settled()
    expect(await svc.read()).toEqual(NOT_CONNECTED)

    // The retry is running (load called again) and its answer is still not_connected.
    let land!: (items: WorkboardItem[]) => void
    load.mockImplementation(() => new Promise((r) => (land = r)))
    vi.advanceTimersByTime(RETRY_AFTER_MS)
    expect((await svc.read()).status).toBe("not_connected")
    expect(load).toHaveBeenCalledTimes(2)
    expect((await svc.read()).status).toBe("not_connected")

    // Once a retry lands it is connected.
    land([ITEM])
    await svc.settled()
    expect((await svc.read()).status).toBe("connected")
  })

  it("a failed sync after a good one is stale", async () => {
    const load = vi.fn<Loader>(async () => [ITEM])
    const { svc } = service(load)
    await svc.read()
    await svc.settled()
    load.mockRejectedValue(Object.assign(new Error("503"), { type: "GitHubHttpError" }))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    await svc.read()
    await svc.settled()
    expect(await svc.read()).toMatchObject({ status: "stale", connected: true, stale: true, items: [ITEM] })
  })
})

describe("cache", () => {
  it("cold start answers connecting at once, then connected once the background sync lands", async () => {
    const load = vi.fn<Loader>(() => new Promise((r) => setTimeout(() => r([ITEM]), 10_000)))
    const { svc } = service(load)
    expect(await svc.read()).toMatchObject({ status: "connecting", connected: false, items: [] })
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await svc.read()).toEqual({ status: "connected", connected: true, fetchedAt: NOW.toISOString(), stale: false, items: [ITEM] })
  })

  it("serves one sync for 5 minutes, single flight, then reads GitHub again", async () => {
    const load = vi.fn<Loader>(async () => [ITEM])
    const { svc } = service(load)
    await Promise.all([svc.read(), svc.read(), svc.read()])
    await svc.settled()
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    await svc.read()
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect((await svc.read()).stale).toBe(false) // refreshing behind a good copy is still fresh
    await svc.settled()
    expect(load).toHaveBeenCalledTimes(2)
    expect((await svc.read()).fetchedAt).toBe(new Date(NOW.getTime() + CACHE_TTL_MS).toISOString())
  })

  it("a failed sync keeps the last good copy as stale, indefinitely, and retries a minute later", async () => {
    const load = vi.fn<Loader>(async () => [ITEM])
    const { svc, log } = service(load)
    await svc.read()
    await svc.settled()

    load.mockRejectedValue(Object.assign(new Error(`401 for ${TOKEN}`), { type: "GitHubHttpError" }))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    await svc.read()
    await svc.settled()
    expect(log).toHaveBeenCalledWith("GitHubHttpError")
    expect(await svc.read()).toEqual({ status: "stale", connected: true, fetchedAt: NOW.toISOString(), stale: true, items: [ITEM] })

    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await svc.read()
    expect(load).toHaveBeenCalledTimes(2)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(RETRY_AFTER_MS)
      await svc.read()
      await svc.settled()
    }
    expect(load).toHaveBeenCalledTimes(7)
    expect(await svc.read()).toMatchObject({ connected: true, stale: true, items: [ITEM] })

    load.mockResolvedValue([])
    vi.advanceTimersByTime(RETRY_AFTER_MS)
    await svc.read()
    await svc.settled()
    expect(await svc.read()).toMatchObject({ connected: true, stale: false, items: [] })
  })

  it("a sync over the time limit is a failure; cold, it goes from connecting to not_connected", async () => {
    const { svc, log } = service(() => new Promise(() => {}))
    expect((await svc.read()).status).toBe("connecting")
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeout")
    expect(await svc.read()).toMatchObject({ status: "not_connected", connected: false, items: [] })
  })

  it("logs a fixed word, never the error's message", () => {
    expect(failureKind(new Error(TOKEN))).toBe("UnknownError")
    expect(failureKind({ type: TOKEN })).toBe("UnknownError")
    expect(failureKind({ type: "IncompleteData" })).toBe("IncompleteData")
  })
})

/* ---------------------------------------------------------------- loader */

const pr = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/rbates7/hotdash/pull/${number}`,
  user: { login: "dev" },
  head: { ref: `feat/${number}`, sha: `sha${number}` },
  draft: false,
  body: null,
  updated_at: "2026-10-16T10:00:00Z",
  merged_at: null,
  requested_reviewers: [],
  ...extra,
})

describe("loadFromGitHub (mocked fetch)", () => {
  function github(routes: Record<string, unknown>) {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init: init ?? {} })
      const path = url.replace("https://api.github.com/repos/rbates7/hotdash", "")
      const key = Object.keys(routes).find((k) => path === k || path.startsWith(`${k}?`) || path.startsWith(`${k}&`))
      if (!key) return new Response("not found", { status: 404 })
      return Response.json(routes[key])
    }) as unknown as typeof fetch
    return { load: createGitHubLoader(fetchImpl), calls }
  }

  it("reads open PRs with details and closed PRs merged in the last 14 days, GET only, token in the header", async () => {
    const { load, calls } = github({
      "/pulls?state=open": [pr(3, { draft: true, updated_at: "2026-10-16T09:00:00Z" }), pr(4)],
      "/pulls?state=closed": [
        pr(2, { merged_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:00:00Z" }),
        pr(5, { merged_at: null, updated_at: "2026-10-09T00:00:00Z" }), // closed, not merged
        pr(1, { merged_at: "2026-09-30T00:00:00Z", updated_at: "2026-10-03T00:00:00Z" }), // too old
      ],
      "/pulls/3": { mergeable: true, mergeable_state: "clean" },
      "/pulls/4": { mergeable: false, mergeable_state: "dirty" },
      "/commits/sha3/check-runs": { check_runs: [{ status: "in_progress", conclusion: null }] },
      "/commits/sha4/check-runs": { check_runs: [{ status: "completed", conclusion: "success" }] },
      "/commits/sha3/status": { state: "pending", statuses: [] },
      "/commits/sha4/status": { state: "success", statuses: [{ state: "success" }] },
      "/pulls/3/reviews": [],
      "/pulls/4/reviews": [{ user: { login: "rev" }, state: "APPROVED" }],
    })

    const items = await load(TOKEN, NOW)
    expect(items.map((i) => [i.number, i.state, i.ci, i.review])).toEqual([
      [4, "needs_fix", "passing", "approved"],
      [3, "working", "pending", "none"],
      [2, "merged", "none", "none"],
    ])
    for (const { init } of calls) {
      expect(init.method).toBe("GET")
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    }
    // Merged PRs are not re-checked.
    expect(calls.some((c) => c.url.includes("/pulls/2"))).toBe(false)
  })

  it("throws a fixed-word error on a non-OK answer", async () => {
    const { load } = github({})
    await expect(load(TOKEN, NOW)).rejects.toMatchObject({ type: "GitHubHttpError" })
  })
})
