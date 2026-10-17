// @vitest-environment node
import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CACHE_TTL_MS,
  DEFAULT_POSTHOG_HOST,
  PosthogHttpError,
  RECENT_HOGQL,
  RETRY_AFTER_MS,
  SPAN_HOGQL,
  WINDOWS_HOGQL,
  createPosthogService,
  failureKind,
  posthogLoader,
  readPosthogConfig,
  type Loader,
  type PosthogService,
  CHLK_POSTHOG_PROJECT_ID,
} from "@/lib/server/posthog"
import { SYNC_TIMEOUT_MS } from "@/lib/server/time-limit"
import type { PosthogData } from "@/lib/posthog-metrics"
import { POSTHOG_NOT_CONNECTED } from "@/lib/posthog-summary"

/** Fake key and project: shaped like PostHog's, valid nowhere. */
const KEY = "phx_hotdashUnitTestOnly000"
const PROJECT = CHLK_POSTHOG_PROJECT_ID
const ENV = { POSTHOG_READONLY_KEY: KEY, NODE_ENV: "test" }
const NOW = new Date("2026-10-14T17:00:00.000Z")
const NOW_SEC = NOW.getTime() / 1000
const DAY = 86_400
/** Real wall time, taken before fake timers replace `performance.now`. */
const wallClock = performance.now.bind(performance)

const DATA: PosthogData = {
  now: NOW_SEC,
  earliest: NOW_SEC - 135 * DAY,
  windows: [
    { w: 0, active: 812, retained: 0 },
    { w: 1, active: 774, retained: 452 },
    { w: 2, active: 702, retained: 390 },
    { w: 3, active: 610, retained: 300 },
  ],
  recent: { day: 214, week: 455 },
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

function service(load: Loader, env: Record<string, string | undefined> = ENV) {
  const log = vi.fn()
  const svc = createPosthogService({ env: () => env, load, log })
  return { svc, log }
}

/** A read that starts a sync, then the sync itself run to the end. */
async function synced(svc: PosthogService) {
  await svc.summary()
  await svc.settled()
  return svc.summary()
}

/* ---------------------------------------------------------------- config */

describe("readPosthogConfig", () => {
  it("reads only POSTHOG_READONLY_KEY (project pinned); missing when unset, invalid when not a personal API key", () => {
    expect(readPosthogConfig({})).toEqual({ kind: "missing" })
    expect(readPosthogConfig({ POSTHOG_READONLY_KEY: " " })).toEqual({ kind: "missing" })
        expect(readPosthogConfig({ POSTHOG_PERSONAL_API_KEY: KEY, POSTHOG_PROJECT_ID: PROJECT })).toEqual({ kind: "missing" }) // only POSTHOG_READONLY_KEY is read
    for (const bad of ["phc_projectKeyCannotQuery", "phx_", "phx_abc def", "Bearer phx_abc", "sk_live_abc"]) {
      expect(readPosthogConfig({ POSTHOG_READONLY_KEY: bad })).toEqual({ kind: "invalid" })
    }
    expect(readPosthogConfig(ENV)).toEqual({ kind: "ok", key: KEY, projectId: PROJECT, host: DEFAULT_POSTHOG_HOST })
  })

  it("takes PostHog Cloud hosts over https only", () => {
    const host = (POSTHOG_HOST: string, NODE_ENV = "production") => readPosthogConfig({ ...ENV, NODE_ENV, POSTHOG_HOST })
    expect(host("https://eu.posthog.com")).toMatchObject({ kind: "ok", host: "https://eu.posthog.com" })
    expect(host("https://us.posthog.com/")).toMatchObject({ kind: "ok", host: "https://us.posthog.com" })
    for (const bad of [
      "http://us.posthog.com",
      "https://us.posthog.com.evil.example",
      "https://evilposthog.com",
      "https://us.posthog.com:8443",
      "https://user:pw@us.posthog.com",
      "https://us.posthog.com/api",
      "https://us.posthog.com?x=1",
      "not a url",
    ]) {
      expect(host(bad)).toEqual({ kind: "invalid" })
    }
  })

  it("only takes a loopback mock host outside production, unless allowed", () => {
    const mock = { ...ENV, POSTHOG_HOST: "http://127.0.0.1:12111" }
    expect(readPosthogConfig({ ...mock, NODE_ENV: "development" })).toMatchObject({ kind: "ok", host: "http://127.0.0.1:12111" })
    expect(readPosthogConfig({ ...mock, NODE_ENV: "production" })).toEqual({ kind: "invalid" })
    expect(readPosthogConfig({ ...mock, NODE_ENV: "production", POSTHOG_ALLOW_MOCK_HOST: "1" })).toMatchObject({ kind: "ok" })
  })
})

/* ----------------------------------------------------------------- cache */

describe("never waits for a sync", () => {
  it("cold start: answers not_connected at once while a 200 s sync runs, then connected once it lands", async () => {
    const load = vi.fn<Loader>(() => new Promise((r) => setTimeout(() => r(DATA), 200_000)))
    const { svc } = service(load)

    const started = wallClock()
    expect(await svc.summary()).toEqual(POSTHOG_NOT_CONNECTED)
    expect(await svc.health()).toBe("unavailable")
    expect(wallClock() - started).toBeLessThan(1_000)
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200_000)
    const after = await svc.summary()
    expect(after.status).toBe("connected")
    expect(after.lastSyncedAt).toBe(NOW.toISOString())
    expect(after.metrics?.activeUsers.value).toBe(812)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a due refresh serves the last good copy at once (still connected) and refreshes behind it", async () => {
    let release!: (d: PosthogData) => void
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load)
    const good = await synced(svc)

    load.mockImplementation(() => new Promise((r) => (release = r)))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect(await svc.summary()).toEqual(good)
    expect(load).toHaveBeenCalledTimes(2)

    release(DATA)
    await svc.settled()
    expect((await svc.summary()).lastSyncedAt).toBe(new Date(NOW.getTime() + CACHE_TTL_MS).toISOString())
  })

  it("a sync over the time limit is a failure: logged, aborted, retried a minute later, the last good copy stale", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc, log } = service(load)
    const good = await synced(svc)

    let aborted: AbortSignal | undefined
    load.mockImplementation((_c, signal) => {
      aborted = signal
      return new Promise(() => {})
    })
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect((await svc.summary()).status).toBe("connected")

    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeout")
    expect(aborted?.aborted).toBe(true)
    expect(await svc.summary()).toMatchObject({ status: "stale", lastSyncedAt: good.lastSyncedAt, metrics: good.metrics })
    expect(await svc.health()).toBe("unavailable")

    load.mockImplementation(async () => DATA)
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await svc.summary()
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect((await synced(svc)).status).toBe("connected")
    expect(load).toHaveBeenCalledTimes(3)
  })

  it("the time limit sits under the routes' maxDuration", async () => {
    const summary = await import("@/app/api/posthog/summary/route")
    const health = await import("@/app/api/health/posthog/route")
    expect(SYNC_TIMEOUT_MS).toBeLessThan(summary.maxDuration * 1000)
    expect(SYNC_TIMEOUT_MS).toBeLessThan(health.maxDuration * 1000)
  })

  it("a cold-start sync that times out leaves not_connected", async () => {
    const { svc, log } = service(() => new Promise(() => {}))
    expect(await svc.summary()).toEqual(POSTHOG_NOT_CONNECTED)
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeout")
    expect(await svc.summary()).toEqual(POSTHOG_NOT_CONNECTED)
  })
})

describe("cache", () => {
  it("serves one sync for 5 minutes, then reads PostHog again", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load)
    expect((await synced(svc)).status).toBe("connected")
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    await svc.summary()
    await svc.health()
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    const later = await synced(svc)
    expect(load).toHaveBeenCalledTimes(2)
    expect(later.lastSyncedAt).toBe(new Date(NOW.getTime() + CACHE_TTL_MS).toISOString())
  })

  it("concurrent requests share one background sync (single flight)", async () => {
    let release!: () => void
    const load = vi.fn<Loader>(() => new Promise((r) => (release = () => r(DATA))))
    const { svc } = service(load)
    const [a, b, h] = await Promise.all([svc.summary(), svc.summary(), svc.health()] as const)
    expect([a, b, h]).toEqual([POSTHOG_NOT_CONNECTED, POSTHOG_NOT_CONNECTED, "unavailable"])
    expect(load).toHaveBeenCalledTimes(1)
    release()
    await svc.settled()
    expect(await svc.health()).toBe("ok")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a sync started before reset() cannot write after it", async () => {
    let release!: () => void
    const { svc } = service(() => new Promise((r) => (release = () => r(DATA))))
    await svc.summary()
    svc.reset()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(await svc.summary()).toEqual(POSTHOG_NOT_CONNECTED)
  })
})

/* -------------------------------------------------------------- fallback */

describe("fallback", () => {
  it("never synced and PostHog fails → not_connected; the log names the class, never the key", async () => {
    const { svc, log } = service(async () => {
      throw Object.assign(new PosthogHttpError(401), { message: `bad key ${KEY} for project ${PROJECT}` })
    })
    expect(await synced(svc)).toEqual(POSTHOG_NOT_CONNECTED)
    expect(await svc.health()).toBe("unavailable")
    expect(log).toHaveBeenCalledWith("PosthogAuthError")
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY)
    expect(JSON.stringify(log.mock.calls)).not.toContain("bad key")
  })

  it("the default logger writes the class name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const svc = createPosthogService({
      env: () => ENV,
      load: async () => {
        throw new TypeError(`fetch failed for https://us.posthog.com?key=${KEY}`)
      },
    })
    await synced(svc)
    expect(warn).toHaveBeenCalledWith("[posthog] sync failed: NetworkError")
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY)
    warn.mockRestore()
  })

  it("a failure after a good sync → stale with the last good figures, retried after a minute", async () => {
    let fail = false
    const load = vi.fn<Loader>(async () => {
      if (fail) throw new PosthogHttpError(503)
      return DATA
    })
    const { svc, log } = service(load)
    const good = await synced(svc)

    fail = true
    vi.advanceTimersByTime(CACHE_TTL_MS)
    const stale = await synced(svc)
    expect(stale).toMatchObject({ status: "stale", lastSyncedAt: good.lastSyncedAt, metrics: good.metrics })
    expect(log).toHaveBeenCalledWith("PosthogServerError")
    expect(await svc.health()).toBe("unavailable")

    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await synced(svc)
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    fail = false
    expect((await synced(svc)).status).toBe("connected")
    expect(load).toHaveBeenCalledTimes(3)
  })

  it("missing key → not_connected / not_configured, and PostHog is never called", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load, {})
    expect(await synced(svc)).toEqual(POSTHOG_NOT_CONNECTED)
    expect(await svc.health()).toBe("not_configured")
    expect(load).not.toHaveBeenCalled()
  })

  it("an invalid key (project key, dotted CI dummy) or a foreign host → refuses to call PostHog at all", async () => {
    for (const env of [
      { POSTHOG_READONLY_KEY: "phc_projectKey" },
      { POSTHOG_READONLY_KEY: "phx_CI.DUMMY.not-a-real-key" },
      { ...ENV, POSTHOG_HOST: "https://evil.example.com" },
    ]) {
      const load = vi.fn<Loader>(async () => DATA)
      const { svc } = service(load, env)
      expect(await synced(svc)).toEqual(POSTHOG_NOT_CONNECTED)
      expect(await svc.health()).toBe("not_configured")
      expect(load).not.toHaveBeenCalled()
    }
  })

  it("the key removed after a good sync → stale with the last figures", async () => {
    const env: Record<string, string | undefined> = { ...ENV }
    const { svc } = service(async () => DATA, env)
    const good = await synced(svc)
    delete env.POSTHOG_READONLY_KEY
    expect(await svc.summary()).toMatchObject({ status: "stale", lastSyncedAt: good.lastSyncedAt })
    expect(await svc.health()).toBe("not_configured")
  })

  it("a reading that does not add up is a failed sync (InvalidData), not a crash or a 0", async () => {
    const { svc, log } = service(async () => ({ ...DATA, recent: { day: 9, week: 1 } }))
    expect(await synced(svc)).toEqual(POSTHOG_NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("InvalidData")
  })

  it("failureKind names known classes only, never a message", () => {
    expect(failureKind(new PosthogHttpError(401))).toBe("PosthogAuthError")
    expect(failureKind(new PosthogHttpError(403))).toBe("PosthogAuthError")
    expect(failureKind(new PosthogHttpError(429))).toBe("PosthogRateLimited")
    expect(failureKind(new PosthogHttpError(500))).toBe("PosthogServerError")
    expect(failureKind(new PosthogHttpError(400))).toBe("PosthogRequestError")
    expect(failureKind(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("TimeoutError")
    expect(failureKind(new TypeError("fetch failed"))).toBe("NetworkError")
    expect(failureKind({ type: `leak ${KEY}` })).toBe("UnknownError")
    expect(failureKind(null)).toBe("UnknownError")
  })
})

/* ------------------------------------------- the real fetch → loopback */

describe("posthogLoader (real fetch → loopback mock, never real PostHog)", () => {
  type Seen = { method: string; url: string; auth: string | undefined; body: { query: { kind: string; query: string } } }
  const seen: Seen[] = []
  let status = 200
  let server: http.Server
  let port = 0

  /** HogQL answers in PostHog's shape: `columns` plus positional `results` (UInt64 as strings sometimes). */
  function answer(query: string) {
    if (query === SPAN_HOGQL) return { columns: ["now", "events", "earliest"], results: [[NOW_SEC, "120345", NOW_SEC - 135 * DAY]] }
    if (query === WINDOWS_HOGQL) {
      return {
        columns: ["w", "active", "retained"],
        results: DATA.windows.map((r) => [r.w, r.active, r.retained]),
      }
    }
    if (query === RECENT_HOGQL) return { columns: ["day", "week"], results: [["214", 455]] }
    return null
  }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = ""
      req.on("data", (c) => (raw += c))
      req.on("end", () => {
        const body = JSON.parse(raw || "{}")
        seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body })
        res.setHeader("Content-Type", "application/json")
        const out = answer(body?.query?.query)
        if (status !== 200 || !out) {
          res.statusCode = status !== 200 ? status : 400
          res.end(JSON.stringify({ detail: "nope" }))
          return
        }
        res.end(JSON.stringify({ ...out, types: [], hogql: "…", is_cached: false }))
      })
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(() => {
    vi.useRealTimers()
    seen.length = 0
    status = 200
  })

  const config = () => {
    const c = readPosthogConfig({ ...ENV, POSTHOG_HOST: `http://127.0.0.1:${port}` })
    if (c.kind !== "ok") throw new Error("config")
    return c
  }

  it("POSTs only fixed HogQL SELECTs to the project's query endpoint, key as Bearer, and reads counts", async () => {
    const data = await posthogLoader()(config())
    expect(seen).toHaveLength(3)
    for (const r of seen) {
      expect(r.method).toBe("POST")
      expect(r.url).toBe(`/api/projects/${PROJECT}/query/`)
      expect(r.auth).toBe(`Bearer ${KEY}`)
      expect(r.body.query.kind).toBe("HogQLQuery")
      expect(r.body.query.query.trimStart()).toMatch(/^SELECT\b/)
      // Counts only: never a person's id, email or properties in the output.
      expect(r.body.query.query).not.toMatch(/properties|email|distinct_id/)
    }
    expect(seen.map((r) => r.body.query.query)).toEqual([SPAN_HOGQL, WINDOWS_HOGQL, RECENT_HOGQL])
    expect(data).toEqual(DATA)
  })

  it("an HTTP failure is a typed error with no body or key in it", async () => {
    status = 401
    const error = await posthogLoader()(config()).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("PosthogAuthError")
    expect(String((error as Error).message)).not.toContain(KEY)
    expect(seen).toHaveLength(1)
  })

  it("an aborted sync stops the request", async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await posthogLoader()(config(), controller.signal).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("AbortError")
  })

  it("an answer in the wrong shape is InvalidData", async () => {
    const fake = (async () => Response.json({ results: [[1]], columns: ["now", "events"] })) as unknown as typeof fetch
    const error = await posthogLoader(fake)(config()).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("InvalidData")
  })

  it("an empty project (no events) reads as no earliest event, not 1970", async () => {
    const fake = (async (_u: string, init: RequestInit) => {
      const q = JSON.parse(String(init.body)).query.query as string
      if (q === SPAN_HOGQL) return Response.json({ columns: ["now", "events", "earliest"], results: [[NOW_SEC, 0, 0]] })
      if (q === WINDOWS_HOGQL) return Response.json({ columns: ["w", "active", "retained"], results: [] })
      return Response.json({ columns: ["day", "week"], results: [[0, 0]] })
    }) as unknown as typeof fetch
    const data = await posthogLoader(fake)(config())
    expect(data).toEqual({ now: NOW_SEC, earliest: null, windows: [], recent: { day: 0, week: 0 } })
  })
})
