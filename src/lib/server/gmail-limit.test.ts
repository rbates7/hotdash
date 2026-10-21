// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { THREAD_TIMEOUT_MS, TOKEN_URL, classifyGoogleError, createGmailService, gmailLoader, gmailThreadLoader, readGmailConfig } from "@/lib/server/gmail"
import {
  GMAIL_CONCURRENCY,
  GMAIL_RETRY_AFTER_MAX_MS,
  RETRY_REASONS,
  createGmailGate,
  createLimiter,
  isRetryableRateLimit,
  parseRetryAfter,
} from "@/lib/server/gmail-limit"
import { withTimeout } from "@/lib/server/time-limit"
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


describe("limiter handoff", () => {
  /** Calls `fn` after `depth` microtask hops, to land in every gap of the release. */
  const afterHops = (depth: number, fn: () => void) => {
    let p = Promise.resolve()
    for (let i = 0; i < depth; i++) p = p.then(() => {})
    void p.then(fn)
  }

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "a freed slot goes to the oldest waiter, never to a caller arriving %i microtasks later",
    async (depth) => {
      const limit = createLimiter(1)
      const order: string[] = []
      let active = 0
      let peak = 0
      const run = (name: string) => async () => {
        active += 1
        peak = Math.max(peak, active)
        order.push(name)
        await Promise.resolve()
        active -= 1
      }
      let late: Promise<void> | undefined
      const first = limit(async () => {
        await run("first")()
        afterHops(depth, () => (late = limit(run("late"))))
      })
      const queued = limit(run("queued"))
      await Promise.all([first, queued])
      await new Promise((r) => setTimeout(r, 0))
      await late
      expect(order).toEqual(["first", "queued", "late"])
      expect(peak).toBe(1)
    }
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("aborted waiters", () => {
  it("a queued call whose caller aborted never runs, and its slot goes to the next waiter", async () => {
    const limit = createLimiter(1)
    let release!: () => void
    const ran: string[] = []
    const first = limit(() => new Promise<void>((r) => (release = r)).then(() => void ran.push("first")))
    const controller = new AbortController()
    const doomed = limit(async () => void ran.push("doomed"), controller.signal).catch((e: unknown) => e)
    const next = limit(async () => void ran.push("next"))
    controller.abort()
    release()
    await Promise.all([first, next])
    expect(await doomed).toBeDefined()
    expect(ran).toEqual(["first", "next"])
  })

  it("an already aborted caller does not take a free slot", async () => {
    const limit = createLimiter(1)
    const task = vi.fn(async () => {})
    const controller = new AbortController()
    controller.abort()
    await expect(limit(task, controller.signal)).rejects.toBeDefined()
    expect(task).not.toHaveBeenCalled()
    await limit(task)
    expect(task).toHaveBeenCalledTimes(1)
  })
})

describe("Retry-After", () => {
  it("parses whole seconds and HTTP dates, never negative", () => {
    const now = Date.parse("2026-10-20T17:00:00Z")
    expect(parseRetryAfter("2", now)).toBe(2000)
    expect(parseRetryAfter("Tue, 20 Oct 2026 17:00:03 GMT", now)).toBe(3000)
    expect(parseRetryAfter("Tue, 20 Oct 2026 16:59:00 GMT", now)).toBe(0)
    expect(parseRetryAfter("soon", now)).toBeUndefined()
    expect(parseRetryAfter(null, now)).toBeUndefined()
  })

  it("waits what Google asks (seconds) instead of the backoff, then succeeds", async () => {
    const google = fakeGoogle((n) => (n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "2" } }) : undefined))
    const waits: number[] = []
    const gate = createGmailGate({ sleep: async (ms) => void waits.push(ms) })
    await gmailThreadLoader(google.fetchImpl, undefined, gate)(CONFIG, THREADS[0]!.id)
    expect(waits).toEqual([2000])
    expect(google.reads()).toBe(2)
  })

  it("honors an HTTP-date Retry-After", async () => {
    const at = new Date(Date.now() + 5_000).toUTCString()
    const google = fakeGoogle((n) => (n === 1 ? new Response("", { status: 429, headers: { "Retry-After": at } }) : undefined))
    const waits: number[] = []
    const gate = createGmailGate({ sleep: async (ms) => void waits.push(ms) })
    await gmailThreadLoader(google.fetchImpl, undefined, gate)(CONFIG, THREADS[0]!.id)
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThan(3_000)
    expect(waits[0]).toBeLessThanOrEqual(5_000)
  })

  it("gives up at once when Retry-After is longer than the time left in the 8 s budget", async () => {
    const google = fakeGoogle(() => new Response("", { status: 429, headers: { "Retry-After": "30" } }))
    const sleep = vi.fn(async () => {})
    const gate = createGmailGate({ sleep })
    const error = await withTimeout(
      (signal) => gmailThreadLoader(google.fetchImpl, undefined, gate)(CONFIG, THREADS[0]!.id, signal),
      THREAD_TIMEOUT_MS
    ).catch((e: unknown) => e)
    expect((error as { type?: string }).type).toBe("GmailRateLimited")
    expect(google.reads()).toBe(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})

describe("the 8 s thread budget (fake timers)", () => {
  it("slow rate-limited answers are cut off at exactly 8 s: SyncTimeout, stale fallback, no reads after", async () => {
    vi.useFakeTimers()
    let reads = 0
    // Every read takes 3 s, then says "rate limited"; the fetch stops when aborted.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === TOKEN_URL) return Response.json({ access_token: "ya29.limit-test", expires_in: 3599 })
      reads += 1
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 3_000)
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t)
          reject(new DOMException("Aborted", "AbortError"))
        })
      })
      return rateLimited()
    }) as unknown as typeof fetch
    const log = vi.fn()
    const gate = createGmailGate({ random: () => 0 })
    const svc = createGmailService({
      env: () => ENV,
      load: async () => THREADS,
      loadThread: gmailThreadLoader(fetchImpl, undefined, gate),
      log,
    })
    await svc.list()
    await svc.settled()
    const caseId = (await svc.list()).cases[0]!.id
    let done = false
    const pending = svc.thread(caseId).then((b) => ((done = true), b))
    // Reads at 0 s, 3.25 s (after 250 ms), 6.75 s (after 500 ms).
    await vi.advanceTimersByTimeAsync(THREAD_TIMEOUT_MS - 1)
    expect(done).toBe(false)
    expect(reads).toBe(3)
    await vi.advanceTimersByTimeAsync(1)
    const body = await pending
    expect(body!.status).toBe("stale")
    expect(log).toHaveBeenLastCalledWith("SyncTimeout", undefined)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(reads).toBe(3)
  })
})

describe("one list of rate reasons", () => {
  it("every retried reason is also labelled GmailRateLimited; the quota ones are labelled but not retried", () => {
    for (const r of RETRY_REASONS) {
      const detail = { step: "api" as const, status: 403, reasons: [r] }
      expect(classifyGoogleError(detail)).toBe("GmailRateLimited")
      expect(isRetryableRateLimit({ detail })).toBe(true)
    }
    for (const r of ["quotaExceeded", "dailyLimitExceeded"]) {
      const detail = { step: "api" as const, status: 403, reasons: [r] }
      expect(classifyGoogleError(detail)).toBe("GmailRateLimited")
      expect(isRetryableRateLimit({ detail })).toBe(false)
    }
  })
})

describe("follow-ups: handoff, aborted waiters, Retry-After cap", () => {
  it("an aborted waiter leaves the queue at once, while the slot is still held", async () => {
    const limit = createLimiter(1)
    let release!: () => void
    const first = limit(() => new Promise<void>((r) => (release = r)))
    const controller = new AbortController()
    const task = vi.fn(async () => {})
    const doomed = limit(task, controller.signal)
    controller.abort(new Error("caller gave up"))
    await expect(doomed).rejects.toThrow("caller gave up") // settles before the slot frees
    release()
    await first
    expect(task).not.toHaveBeenCalled()
  })

  it("after an aborted waiter, the handoff keeps the count right: one at a time, no slot leaked", async () => {
    const limit = createLimiter(1)
    let release!: () => void
    const first = limit(() => new Promise<void>((r) => (release = r)))
    const controller = new AbortController()
    const doomed = limit(async () => {}, controller.signal).catch(() => "aborted")
    controller.abort()
    expect(await doomed).toBe("aborted")
    release()
    await first
    let active = 0
    let peak = 0
    const work = async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1))
      active -= 1
    }
    await Promise.all([limit(work), limit(work), limit(work)])
    expect(peak).toBe(1)
    // The slot came back: a fresh call runs at once.
    await expect(limit(async () => "ok")).resolves.toBe("ok")
  })

  it("a waiter aborted after it was handed the slot passes it on without running", async () => {
    const limit = createLimiter(1)
    let release!: () => void
    const ran: string[] = []
    const first = limit(() => new Promise<void>((r) => (release = r)))
    const controller = new AbortController()
    const raced = limit(async () => void ran.push("raced"), controller.signal).catch(() => "aborted")
    const next = limit(async () => void ran.push("next"))
    release() // hands the slot to `raced`...
    controller.abort() // ...which aborts before its continuation runs
    await first
    expect(await raced).toBe("aborted")
    await next
    expect(ran).toEqual(["next"])
  })

  it("caps Retry-After at a named limit: longer asks fail at once, the cap itself is waited", async () => {
    expect(GMAIL_RETRY_AFTER_MAX_MS).toBe(30_000)
    const seconds = GMAIL_RETRY_AFTER_MAX_MS / 1000
    const tooLong = fakeGoogle(() => new Response("", { status: 429, headers: { "Retry-After": String(seconds + 1) } }))
    const sleep = vi.fn(async () => {})
    const error = await gmailThreadLoader(tooLong.fetchImpl, undefined, createGmailGate({ sleep }))(CONFIG, THREADS[0]!.id).catch(
      (e: unknown) => e
    )
    expect((error as { type?: string }).type).toBe("GmailRateLimited")
    expect(tooLong.reads()).toBe(1)
    expect(sleep).not.toHaveBeenCalled()

    const atCap = fakeGoogle((n) => (n === 1 ? new Response("", { status: 429, headers: { "Retry-After": String(seconds) } }) : undefined))
    const waits: number[] = []
    await gmailThreadLoader(atCap.fetchImpl, undefined, createGmailGate({ sleep: async (ms) => void waits.push(ms) }))(CONFIG, THREADS[0]!.id)
    expect(waits).toEqual([GMAIL_RETRY_AFTER_MAX_MS])
  })
})
