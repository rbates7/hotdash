/**
 * App Store payers (group (2) of the Subscribers total), as
 * `/api/stripe/summary` carries them in their own `appStore` field. Shared
 * by the server and the browser; the reading itself is server only
 * (`src/lib/server/app-store.ts`).
 *
 * - `connected`     — counted within the cache window; `asOf` is when.
 * - `stale`         — the database could not be read; the last good count.
 * - `not_connected` — no database URL, or it has never answered: no count.
 *                     Never a made-up 0.
 */
export type AppStoreSummary =
  | { status: "connected" | "stale"; count: number; asOf: string }
  | { status: "not_connected" }

export const APP_STORE_NOT_CONNECTED: AppStoreSummary = { status: "not_connected" }

/** Read back defensively: anything that is not a complete reading is null. */
export function parseAppStoreSummary(value: unknown): AppStoreSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return APP_STORE_NOT_CONNECTED
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.count !== "number" || !Number.isInteger(v.count) || v.count < 0) return null
  if (typeof v.asOf !== "string" || !Number.isFinite(Date.parse(v.asOf))) return null
  return { status: v.status, count: v.count, asOf: v.asOf }
}
