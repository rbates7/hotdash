// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import { TOKEN_URL, createGmailService, gmailLoader, gmailThreadLoader, readGmailConfig } from "@/lib/server/gmail"
import { GMAIL_CONCURRENCY, createGmailGate, createLimiter, isRetryableRateLimit } from "@/lib/server/gmail-limit"
import { gmailApiThread, gmailFixtureThreads } from "@/test/gmail-fixture"

/** Fake credentials: shaped like Google's, valid nowhere. */
const ENV = {
  GMAIL_CLIENT_ID: "123456-hotdashlimittest.apps.googleusercontent.com",
  GMAIL_CLIENT_SECRET: "GOCSPX-hotdashLimitTestOnlySecret0",
  GMAIL_REFRESH_TOKEN: "1//hotdashLimitTestOnlyRefreshToken0",
}
const CONFIG = readGmailConfig(ENV) as Extract<ReturnType<typeof readGmailConfig>, { kind: "ok" }>
const THREADS = gmailFixtureThreads(Date.now())

const rateLimited = (reason = "rateLimitExceeded") =>
  Response.json({ error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason }] } }, { status: 403 })

/** Google, faked: `api(n)` may answer the nth Gmail read; otherwise the fixture. Tracks reads in flight. */
function fakeGoogle(api?: (n: number) => Response | undefined) {
  const byId = new Map(THREADS.map((t) => [t.id, gmailApiThread(t)]))
  let n = 0
  let inFlight = 0
  let peak = 0
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === TOKEN_URL) return Response.json({ access_token: "ya29.limit-test", expires_in: 3599 })
    n += 1
    inFlight += 1
    peak = Math.max(peak, inFlight)
    try {
      await new Promise((r) => setTimeout(r, 2))
      const answer = api?.(n)
      if (answer) return answer
      const u = new URL(url)
      if (u.pathname.endsWith("/threads")) return Response.json({ threads: [...byId.keys()].map((id) => ({ id })) })
      return Response.json(byId.get(u.pathname.split("/").pop()!))
    } finally {
      inFlight -= 1
    }
  }) as unknown as typeof fetch
  return { fetchImpl, reads: () => n, peak: () => peak }
}

const noWait = () => createGmailGate({ sleep: async () => {} })

describe("concurrency", () => {
  it("the limiter never runs more than 5 at once", async () => {
    const limit = createLimiter(GMAIL_CONCURRENCY)
    let active = 0
    let peak = 0
    await Promise.all(
      Array.from({ length: 40 }, () =>
        limit(async () => {
          active += 1
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 1))
          active -= 1
        })
      )
    )
    expect(peak).toBe(5)
  })

  it("a sync and on-demand thread reads share one gate: never more than 5 Gmail calls in flight", async () => {
    expect(THREADS.length).toBeGreaterThan(5)
    const google = fakeGoogle()
    const gate = noWait()
    const load = gmailLoader(google.fetchImpl, undefined, gate)
    const loadThread = gmailThreadLoader(google.fetchImpl, undefined, gate)
    await Promise.all([load(CONFIG), load(CONFIG), ...THREADS.map((t) => loadThread(CONFIG, t.id))])
    expect(google.reads()).toBe(2 * (1 + THREADS.length) + THREADS.length)
    expect(google.peak()).toBe(5)
  })
})

describe("retry on rate limit", () => {
  it("retries a 403 rateLimitExceeded with growing, jittered backoff, then succeeds", async () => {
    const google = fakeGoogle((n) => (n <= 2 ? rateLimited() : undefined))
    const waits: number[] = []
    const gate = createGmailGate({ sleep: async (ms) => void waits.push(ms), random: () => 0.5 })
    const raw = await gmailThreadLoader(google.fetchImpl, undefined, gate)(CONFIG, THREADS[0]!.id)
    expect((raw as { id: string }).id).toBe(THREADS[0]!.id)
    expect(google.reads()).toBe(3)
    expect(waits).toEqual([375, 750])
  })

  it.each(["userRateLimitExceeded", "rateLimitExceeded"])("retries 403 %s and 429", async (reason) => {
    const google = fakeGoogle((n) => (n === 1 ? rateLimited(reason) : n === 2 ? new Response("", { status: 429 }) : undefined))
    await gmailThreadLoader(google.fetchImpl, undefined, noWait())(CONFIG, THREADS[0]!.id)
    expect(google.reads()).toBe(3)
  })

  it("gives up after 3 retries; the thread read falls back to stale snippets and the log has the reason only", async () => {
    let limited = false
    const google = fakeGoogle(() => (limited ? rateLimited() : undefined))
    const gate = noWait()
    const log = vi.fn()
    const svc = createGmailService({
      env: () => ENV,
      load: gmailLoader(google.fetchImpl, undefined, gate),
      loadThread: gmailThreadLoader(google.fetchImpl, undefined, gate),
      log,
    })
    await svc.list()
    await svc.settled()
    const caseId = (await svc.list()).cases[0]!.id
    const before = google.reads()
    limited = true
    const body = await svc.thread(caseId)
    expect(google.reads() - before).toBe(4)
    expect(body!.status).toBe("stale")
    expect(body!.messages.length).toBeGreaterThan(0)
    expect(log).toHaveBeenLastCalledWith("GmailRateLimited", "rate limited: api status=403 apiStatus=PERMISSION_DENIED reason=rateLimitExceeded")
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/ya29|GOCSPX|1\/\/|@/)
  })

  it("a sync that stays rate limited keeps the last good copy, served as stale", async () => {
    let limited = false
    const google = fakeGoogle(() => (limited ? rateLimited("userRateLimitExceeded") : undefined))
    let now = Date.now()
    const svc = createGmailService({ env: () => ENV, load: gmailLoader(google.fetchImpl, undefined, noWait()), clock: () => now, log: () => {} })
    await svc.list()
    await svc.settled()
    const good = await svc.list()
    expect(good.status).toBe("connected")
    limited = true
    now += 6 * 60_000
    await svc.list()
    await svc.settled()
    const stale = await svc.list()
    expect(stale.status).toBe("stale")
    expect(stale.cases).toEqual(good.cases)
  })

  it.each([
    ["insufficientPermissions", 403],
    ["quotaExceeded", 403],
    ["dailyLimitExceeded", 403],
    [undefined, 403],
    [undefined, 401],
    [undefined, 500],
  ])("does not retry %s (%i)", async (reason, status) => {
    const google = fakeGoogle(() =>
      Response.json({ error: { code: status, errors: reason ? [{ reason }] : [] } }, { status })
    )
    const sleep = vi.fn(async () => {})
    const error = await gmailThreadLoader(google.fetchImpl, undefined, createGmailGate({ sleep }))(CONFIG, THREADS[0]!.id).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(google.reads()).toBe(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it("stops waiting when the caller's time budget aborts", async () => {
    const controller = new AbortController()
    const gate = createGmailGate({ baseMs: 60_000 })
    const call = vi.fn(async () => {
      throw Object.assign(new Error("GmailRateLimited"), { detail: { status: 429 } })
    })
    const pending = gate(call, controller.signal).catch((e: unknown) => e)
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    expect(await pending).toBeDefined()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it("isRetryableRateLimit reads only the status and reasons", () => {
    expect(isRetryableRateLimit({ detail: { status: 403, reasons: ["rateLimitExceeded"] } })).toBe(true)
    expect(isRetryableRateLimit({ detail: { status: 403, reasons: ["insufficientPermissions"] } })).toBe(false)
    expect(isRetryableRateLimit(new Error("x"))).toBe(false)
    expect(isRetryableRateLimit(null)).toBe(false)
  })
})

