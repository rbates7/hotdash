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
