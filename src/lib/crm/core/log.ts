/**
 * Errors from the Google, Stripe and Postgres clients carry their request
 * config as enumerable properties — logging the object prints OAuth refresh
 * tokens and database connection strings in the clear. gaxios' own redactor
 * does not cover `refresh_token`. Never hand a raw error to console.*; use
 * this instead.
 */
export function logError(context: string, error: unknown) {
  if (error instanceof Error) {
    const code = (error as { code?: string | number }).code
    const status = (error as { status?: number }).status
    console.error(
      `[${context}] ${error.name}: ${error.message}` +
        (code !== undefined ? ` (code ${code})` : "") +
        (status !== undefined ? ` (status ${status})` : "")
    )
    return
  }
  console.error(`[${context}] non-error thrown`)
}
