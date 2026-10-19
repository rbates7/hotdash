// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SentryIssue } from "@/lib/inbox-sources"
import {
  SENTRY_CACHE_TTL_MS,
  SENTRY_RETRY_AFTER_MS,
  createSentryLoader,
  createSentryService,
  readSentryConfig,
  sentryFailureKind,
  type SentryLoader,
} from "@/lib/server/sentry"

/** A fake token, shaped like an org token: valid nowhere. */
const TOKEN = "sntrys_hotdashUnitTestOnly0000000000000000000000"
const ENV = { SENTRY_READONLY_TOKEN: TOKEN }
const NOW = new Date("2026-10-18T20:00:00.000Z")

const ISSUE: SentryIssue = {
  id: "1",
  shortId: "CHLK-IOS-1",
  title: "Crash",
  culprit: "AppDelegate",
  permalink: "https://chlk.sentry.io/issues/1/",
  level: "error",
  status: "unresolved",
  substatus: "new",
  count: "4",
  userCount: 2,
  firstSeen: "2026-10-18T19:00:00Z",
  lastSeen: "2026-10-18T19:50:00Z",
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

describe("readSentryConfig", () => {
  it("is missing with no token and invalid with whitespace or quotes", () => {
    expect(readSentryConfig({})).toEqual({ kind: "missing" })
    expect(readSentryConfig({ SENTRY_READONLY_TOKEN: " " })).toEqual({ kind: "missing" })
    for (const bad of ["short", `${TOKEN} x`, `"${TOKEN}"`, `${TOKEN}\n`.repeat(2)]) {
      expect(readSentryConfig({ SENTRY_READONLY_TOKEN: bad })).toEqual({ kind: "invalid" })
    }
    expect(readSentryConfig(ENV)).toEqual({ kind: "ok", token: TOKEN })
  })
})

describe("createSentryLoader", () => {
  it("makes one GET to chlk/chlk-ios issues with the token as a bearer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([{ ...ISSUE, extra: "dropped" }]), { status: 200 }))
    const issues = await createSentryLoader(fetchImpl)(TOKEN)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/us\.sentry\.io\/api\/0\/projects\/chlk\/chlk-ios\/issues\/\?/)
    expect(new URL(String(url)).searchParams.get("query")).toBe("is:unresolved")
    expect(init?.method).toBe("GET")
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(issues).toEqual([ISSUE])
  })

  it("throws a typed error on a bad status or body, never the body", async () => {
    const denied = createSentryLoader(async () => new Response("token rejected: sntrys_...", { status: 401 }))
    await expect(denied(TOKEN)).rejects.toMatchObject({ type: "SentryHttpError" })
    const odd = createSentryLoader(async () => new Response(JSON.stringify({ detail: "x" }), { status: 200 }))
    await expect(odd(TOKEN)).rejects.toMatchObject({ type: "InvalidData" })
  })
})

describe("createSentryService", () => {
  const svc = (load: SentryLoader, env: Record<string, string | undefined> = ENV) => {
    const log = vi.fn()
    return { svc: createSentryService({ env: () => env, load, log }), log }
  }

  it("is not connected with no token and never calls Sentry", () => {
    const load = vi.fn<SentryLoader>()
    expect(svc(load, {}).svc.read()).toEqual({ status: "not_connected", fetchedAt: null, issues: [] })
    expect(load).not.toHaveBeenCalled()
  })

  it("connecting → connected, cached for 5 minutes", async () => {
    const load = vi.fn<SentryLoader>(async () => [ISSUE])
    const { svc: s } = svc(load)
    expect(s.read().status).toBe("connecting")
    await s.settled()
    expect(s.read()).toEqual({ status: "connected", fetchedAt: NOW.toISOString(), issues: [ISSUE] })
    vi.advanceTimersByTime(SENTRY_CACHE_TTL_MS - 1)
    s.read()
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    s.read()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("a failed first sync is not connected; a failed refresh keeps the last issues stale", async () => {
    let fail = true
    const load = vi.fn<SentryLoader>(async () => {
      if (fail) throw Object.assign(new Error(TOKEN), { type: "SentryHttpError" })
      return [ISSUE]
    })
    const { svc: s, log } = svc(load)
    s.read()
    await s.settled()
    expect(s.read().status).toBe("not_connected")
    expect(log).toHaveBeenCalledWith("SentryHttpError")
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)

    fail = false
    vi.advanceTimersByTime(SENTRY_RETRY_AFTER_MS)
    s.read()
    await s.settled()
    expect(s.read().status).toBe("connected")

    fail = true
    vi.advanceTimersByTime(SENTRY_CACHE_TTL_MS)
    s.read()
    await s.settled()
    expect(s.read()).toMatchObject({ status: "stale", issues: [ISSUE] })
  })

  it("logs only fixed words", () => {
    expect(sentryFailureKind(new Error(TOKEN))).toBe("UnknownError")
    expect(sentryFailureKind({ type: "SyncTimeout" })).toBe("SyncTimeout")
  })
})
