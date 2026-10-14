/**
 * App Store payers and invoice (school/district) coaches — groups (2) and
 * (3) of the Subscribers total — as `/api/stripe/summary` carries them in
 * their own `appStore` field. Shared by the server and the browser; the
 * reading itself is server only (`src/lib/server/app-store.ts`).
 *
 * - `connected`     — counted within the cache window; `asOf` is when.
 * - `stale`         — the database could not be read; the last good counts.
 * - `not_connected` — no database URL, or it has never answered: no count.
 *                     Never a made-up 0.
 *
 * `count` is the App Store payers, `invoice` the invoice coaches. A payload
 * from an older server has no `invoice`: it is left off (shown as "—" and
 * kept out of the total), never read as 0.
 */
export type AppStoreSummary =
  | { status: "connected" | "stale"; count: number; invoice?: number; asOf: string }
  | { status: "not_connected" }

export const APP_STORE_NOT_CONNECTED: AppStoreSummary = { status: "not_connected" }

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0
}

/**
 * Read back defensively: anything that is not a complete reading is null.
 * An `invoice` that is missing or not a count is left off on its own; the
 * App Store count still stands.
 */
export function parseAppStoreSummary(value: unknown): AppStoreSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return APP_STORE_NOT_CONNECTED
  if (v.status !== "connected" && v.status !== "stale") return null
  if (!isCount(v.count)) return null
  if (typeof v.asOf !== "string" || !Number.isFinite(Date.parse(v.asOf))) return null
  return { status: v.status, count: v.count, ...(isCount(v.invoice) && { invoice: v.invoice }), asOf: v.asOf }
}
