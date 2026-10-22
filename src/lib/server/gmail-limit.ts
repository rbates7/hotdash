import "server-only"

import { deadlineOf } from "@/lib/server/time-limit"

/**
 * Keeps Gmail calls polite: at most `GMAIL_CONCURRENCY` in flight at once
 * across every caller in this server instance (the background sync and the
 * on-demand `?caseId=` reads share one gate), and a short, jittered retry
 * when Google answers "slow down" (429, or 403 `rateLimitExceeded` /
 * `userRateLimitExceeded`). Every other failure — a permission 403, a daily
 * quota, a 401, a 5xx — is thrown at once, unchanged.
 *
 * A call does not hold its slot while it waits to retry, and a wait ends
 * early when the caller's signal aborts (the sync's 240 s or the thread
 * read's 8 s budget), so retries never outlast the existing timeouts.
 */

/** Gmail calls in flight at once, per server instance. */
export const GMAIL_CONCURRENCY = 5
/** Retries after the first try, so at most 4 calls for one read. */
export const GMAIL_MAX_RETRIES = 3
/** First backoff; doubles each retry (250, 500, 1000 ms) plus up to as much again of jitter. */
export const GMAIL_BACKOFF_MS = 250
/**
 * The longest `Retry-After` we will honor, even with no caller budget. When
 * Google asks for more, the call fails at once (callers fall back to stale).
 */
export const GMAIL_RETRY_AFTER_MAX_MS = 30_000

/**
 * The 403 reasons that mean "slow down and try again" within seconds.
 * `gmail.ts` labels these plus the quota reasons (`quotaExceeded`,
 * `dailyLimitExceeded`) as `GmailRateLimited`; only these are retried,
 * because a spent quota does not come back within our time budget.
 */
export const RETRY_REASONS: ReadonlySet<string> = new Set(["rateLimitExceeded", "userRateLimitExceeded"])

/**
 * Google's `Retry-After` as a wait in ms: whole seconds, or an HTTP date
 * (measured from `nowMs`). Undefined when absent or unreadable; never negative.
 */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  const v = value?.trim()
  if (!v) return undefined
  if (/^\d{1,6}$/.test(v)) return Number(v) * 1000
  const at = Date.parse(v)
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs)
}

/** Whether a failed call is worth retrying: a 429, or a 403 with a short-term rate reason. */
export function isRetryableRateLimit(error: unknown): boolean {
  const detail = (error as { detail?: { status?: unknown; reasons?: unknown } } | null)?.detail
  if (!detail) return false
  if (detail.status === 429) return true
  const reasons = Array.isArray(detail.reasons) ? detail.reasons : []
  return detail.status === 403 && reasons.some((r) => typeof r === "string" && RETRY_REASONS.has(r))
}

/** The error to throw for an aborted caller: its signal's reason, or a plain AbortError. */
const abortError = (signal: AbortSignal) => signal.reason ?? new DOMException("Aborted", "AbortError")

/**
 * At most `max` of the given tasks run at once; the rest queue in order.
 * A finished task hands its slot straight to the next waiter (the count
 * never drops and climbs back), so a caller arriving in between cannot
 * jump the queue or make it `max + 1`.
 */
export function createLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  /** Hand the slot to the next live waiter without freeing it; free it only when nobody waits. */
  const release = () => {
    const next = queue.shift()
    if (next) next()
    else active -= 1
  }
  return async function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError(signal)
    if (active < max) {
      active += 1
    } else {
      // Queued: the slot is ours when `wake` runs (`release` passed it on without freeing it).
      // If the caller aborts first, leave the queue at once so no slot is ever handed to it.
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal?.removeEventListener("abort", onAbort)
          resolve()
        }
        const onAbort = () => {
          const i = queue.indexOf(wake)
          if (i !== -1) queue.splice(i, 1)
          reject(abortError(signal!))
        }
        queue.push(wake)
        signal?.addEventListener("abort", onAbort, { once: true })
      })
    }
    try {
      // Handed the slot but aborted before running (abort raced the handoff): pass it on, don't call.
      if (signal?.aborted) throw abortError(signal)
      return await task()
    } finally {
      release()
    }
  }
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

/** `setTimeout` as a promise that rejects at once when `signal` aborts. */
export const abortableSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"))
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })

export type GmailGate = <T>(call: () => Promise<T>, signal?: AbortSignal) => Promise<T>

export function createGmailGate({
  concurrency = GMAIL_CONCURRENCY,
  maxRetries = GMAIL_MAX_RETRIES,
  baseMs = GMAIL_BACKOFF_MS,
  sleep = abortableSleep,
  random = Math.random,
  now = Date.now,
  retryAfterMaxMs = GMAIL_RETRY_AFTER_MAX_MS,
}: {
  concurrency?: number
  maxRetries?: number
  baseMs?: number
  sleep?: Sleep
  random?: () => number
  now?: () => number
  retryAfterMaxMs?: number
} = {}): GmailGate {
  const limit = createLimiter(concurrency)
  return async (call, signal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await limit(call, signal)
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableRateLimit(error) || signal?.aborted) throw error
        const backoff = baseMs * 2 ** attempt
        const retryAfter = (error as { detail?: { retryAfterMs?: unknown } }).detail?.retryAfterMs
        const asked = typeof retryAfter === "number" ? retryAfter : undefined
        // Google asked for longer than we ever wait: give up now rather than hold the caller.
        if (asked !== undefined && asked > retryAfterMaxMs) throw error
        const wait = asked ?? backoff + Math.floor(random() * backoff)
        // Google asked for longer than we have left: give up now (the caller falls back to stale).
        const deadline = deadlineOf(signal)
        if (deadline !== undefined && wait >= deadline - now()) throw error
        await sleep(wait, signal)
      }
    }
  }
}

/** The one gate for this server process, shared by every Gmail loader. */
export const sharedGmailGate: GmailGate = createGmailGate()
