/**
 * Wrong-login limiter: after MAX_FAILURES wrong attempts from one client
 * inside WINDOW_MS, that client is refused until the oldest failure ages out.
 *
 * In-memory and per instance (each Vercel instance keeps its own counts; a
 * cold start clears them). It slows casual guessing; it is not a distributed
 * lockout. Adapted from #38's limiter.
 */

export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000
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

  function fail(key: string, now = Date.now()): LimitCheck {
    if (failures.size >= SWEEP_AT) for (const k of [...failures.keys()]) recent(k, now)
    failures.set(key, [...recent(key, now), now])
    return check(key, now)
  }

  function reset(key: string) {
    failures.delete(key)
  }

  return { check, fail, reset, size: () => failures.size }
}

/** One limiter per server instance, shared by every login attempt. */
export const loginLimiter = createRateLimiter()

/** The client key: first X-Forwarded-For hop (Vercel sets it), else "unknown". */
export function clientKey(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown"
}
