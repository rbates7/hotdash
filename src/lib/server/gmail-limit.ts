import "server-only"

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

/** The 403 reasons that mean "slow down and try again", not "not allowed". */
const RETRY_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"])

/** Whether a failed call is worth retrying: a 429, or a 403 with a short-term rate reason. */
export function isRetryableRateLimit(error: unknown): boolean {
  const detail = (error as { detail?: { status?: unknown; reasons?: unknown } } | null)?.detail
  if (!detail) return false
  if (detail.status === 429) return true
  const reasons = Array.isArray(detail.reasons) ? detail.reasons : []
  return detail.status === 403 && reasons.some((r) => typeof r === "string" && RETRY_REASONS.has(r))
}

/**
 * At most `max` of the given tasks run at once; the rest queue in order.
 * A finished task hands its slot straight to the next waiter (the count
 * never drops and climbs back), so a caller arriving in between cannot
 * jump the queue or make it `max + 1`.
 */
export function createLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  const release = () => {
    const next = queue.shift()
    if (next) next()
    else active -= 1
  }
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < max) active += 1
    // The slot is ours when this resolves: `release` passed it on without freeing it.
    else await new Promise<void>((resolve) => queue.push(resolve))
    try {
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
}: {
  concurrency?: number
  maxRetries?: number
  baseMs?: number
  sleep?: Sleep
  random?: () => number
} = {}): GmailGate {
  const limit = createLimiter(concurrency)
  return async (call, signal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await limit(call)
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableRateLimit(error) || signal?.aborted) throw error
        const backoff = baseMs * 2 ** attempt
        await sleep(backoff + Math.floor(random() * backoff), signal)
      }
    }
  }
}

/** The one gate for this server process, shared by every Gmail loader. */
export const sharedGmailGate: GmailGate = createGmailGate()
