/**
 * Failed sign-in limiter: after MAX_FAILURES wrong attempts for one key
 * (IP + email) inside WINDOW_MS, that key is locked until the oldest failure
 * in the window ages out.
 *
 * In-memory and per-instance: each server process (each serverless instance
 * on Vercel) keeps its own counts, and a restart or cold start clears them.
 * It slows down casual guessing; it is not a distributed lockout. A shared
 * store (e.g. Redis) would be needed for that.
 */

export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000
/** Sweep expired keys once the map gets this big, so it cannot grow unbounded. */
const SWEEP_AT = 1000

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number }

export function createRateLimiter({
  maxFailures = MAX_FAILURES,
  windowMs = WINDOW_MS,
}: { maxFailures?: number; windowMs?: number } = {}) {
  const failures = new Map<string, number[]>()

  function recent(key: string, now: number) {
    const kept = (failures.get(key) ?? []).filter((at) => now - at < windowMs)
    if (kept.length) failures.set(key, kept)
    else failures.delete(key)
    return kept
  }

  function check(key: string, now = Date.now()): LimitCheck {
    const kept = recent(key, now)
    if (kept.length < maxFailures) return { allowed: true }
    return { allowed: false, retryAfterMs: kept[kept.length - maxFailures] + windowMs - now }
  }

  /** Record a failure and report whether the key is now locked. */
  function fail(key: string, now = Date.now()): LimitCheck {
    if (failures.size >= SWEEP_AT) {
      for (const k of [...failures.keys()]) recent(k, now)
    }
    failures.set(key, [...recent(key, now), now])
    return check(key, now)
  }

  function reset(key: string) {
    failures.delete(key)
  }

  return { check, fail, reset, size: () => failures.size }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>

/** Whole minutes for the "Try again in N minutes" message (at least 1). */
export function minutesUntil(ms: number) {
  return Math.max(1, Math.ceil(ms / 60_000))
}

/** One limiter per server instance, shared by every sign-in attempt. */
export const signInLimiter = createRateLimiter()
