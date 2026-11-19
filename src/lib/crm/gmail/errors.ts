// Pure helpers for reading Google API errors. Kept SDK-free so the sync layer
// and its tests can use them without importing @googleapis/gmail.

/**
 * HTTP status of a Google API error. GaxiosError (gaxios 7) sets both
 * `status` and `response.status`; older shapes and hand-built errors may only
 * carry `code` as a number or a numeric string. Non-numeric codes such as
 * "ECONNRESET" are ignored.
 */
export function googleErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined
  const err = error as {
    status?: unknown
    code?: unknown
    response?: { status?: unknown }
  }
  for (const candidate of [err.response?.status, err.status, err.code]) {
    if (typeof candidate === "number" && Number.isInteger(candidate)) {
      return candidate
    }
    if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) {
      return Number(candidate)
    }
  }
  return undefined
}

export function isGoogleNotFound(error: unknown): boolean {
  return googleErrorStatus(error) === 404
}

const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
])

/**
 * True for a Gmail rate or quota error that is worth retrying: HTTP 429, or
 * a 403 whose reason or message says the query-cost / rate limit was hit.
 * A 403 for permissions or a disabled API is left alone.
 */
export function isGoogleRateLimited(error: unknown): boolean {
  const status = googleErrorStatus(error)
  if (status === 429) return true
  if (status !== 403) return false

  const err = error as {
    message?: unknown
    errors?: unknown
    response?: {
      data?: {
        error?: { message?: unknown; errors?: unknown; status?: unknown }
      }
    }
  }
  const googleError = err.response?.data?.error
  const reasonItems: unknown[] = []
  if (Array.isArray(googleError?.errors)) reasonItems.push(...googleError.errors)
  if (Array.isArray(err.errors)) reasonItems.push(...err.errors)
  for (const item of reasonItems) {
    if (item && typeof item === "object" && "reason" in item) {
      const reason = (item as { reason?: unknown }).reason
      if (typeof reason === "string" && RATE_LIMIT_REASONS.has(reason)) {
        return true
      }
    }
  }
  if (googleError?.status === "RESOURCE_EXHAUSTED") return true

  const message = [err.message, googleError?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
  return /quota exceeded|rate[_ ]?limit|too many requests/i.test(message)
}

/**
 * A failed Gmail call, named by method so sync_runs and the server log say
 * which request broke. Carries only the method, status, and Google's message,
 * never request config (which holds the OAuth bearer token).
 */
export class GmailApiError extends Error {
  readonly method: string
  readonly status: number | undefined

  constructor(method: string, cause: unknown) {
    const status = googleErrorStatus(cause)
    const reason = cause instanceof Error ? cause.message : "Unknown error."
    super(`Gmail ${method} failed${status ? ` (${status})` : ""}: ${reason}`)
    this.name = "GmailApiError"
    this.method = method
    this.status = status
  }
}
