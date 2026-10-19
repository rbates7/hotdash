/**
 * App Store payers (group (2) of the Subscribers total), as
 * `/api/stripe/summary` carries them in their own `appStore` field. Shared
 * by the server and the browser; the reading itself is server only
 * (`src/lib/server/app-store.ts`).
 *
 * - `connected`     — counted within the cache window; `asOf` is when.
 * - `stale`         — the database could not be read; the last good count.
 * - `connecting`    — a URL is set and the first count is still running:
 *                     no count yet (the total waits for it, never sample).
 * - `not_connected` — no database URL, or it has never answered: no count.
 *                     Never a made-up 0.
 *
 * A `connected` or `stale` count of 0 is suspect (`isSuspectAppStore`):
 * there are ~53 App Store payers, and a 0 has meant the read-only role
 * could not see the rows (RLS) — the query ran, the answer was wrong. The
 * wire format is unchanged; the screens treat it as no count, with a
 * warning, never as a real 0.
 */
export type AppStoreSummary =
  | { status: "connected" | "stale"; count: number; asOf: string }
  | { status: "connecting" }
  | { status: "not_connected" }

export const APP_STORE_NOT_CONNECTED: AppStoreSummary = { status: "not_connected" }
export const APP_STORE_CONNECTING: AppStoreSummary = { status: "connecting" }

/** Read back defensively: anything that is not a complete reading is null. */
export function parseAppStoreSummary(value: unknown): AppStoreSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return APP_STORE_NOT_CONNECTED
  if (v.status === "connecting") return APP_STORE_CONNECTING
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.count !== "number" || !Number.isInteger(v.count) || v.count < 0) return null
  if (typeof v.asOf !== "string" || !Number.isFinite(Date.parse(v.asOf))) return null
  return { status: v.status, count: v.count, asOf: v.asOf }
}

/** A count of 0 from a source that answered: almost surely a blocked read, not no payers. */
export function isSuspectAppStore(s: AppStoreSummary): boolean {
  return (s.status === "connected" || s.status === "stale") && s.count === 0
}

/** The App Store row's value when its count is suspect, in place of "0". */
export const APP_STORE_SUSPECT_TEXT = "Check source"
/** The row's accessible label, and the fine print under the breakdown. */
export const APP_STORE_SUSPECT_LABEL = "Warning: App Store count is suspect"
export const APP_STORE_SUSPECT_NOTE = "App Store read 0 — check database access (likely a permissions/RLS issue)"

/** `/api/health/app-store`'s one word: no count, no error text. */
export type AppStoreHealth = "ok" | "suspect_zero" | "stale" | "connecting" | "not_connected"

export function appStoreHealth(s: AppStoreSummary): AppStoreHealth {
  if (s.status === "not_connected" || s.status === "connecting") return s.status
  if (isSuspectAppStore(s)) return "suspect_zero"
  return s.status === "stale" ? "stale" : "ok"
}

/** The count has not landed yet on a server that has a database URL: anything built on it waits. */
export function isAppStoreConnecting(s: AppStoreSummary | undefined): boolean {
  return s?.status === "connecting"
}
