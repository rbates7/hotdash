import { lastUpdatedLabel } from "@/lib/live-metrics"

/**
 * Paying coaches (Radcliffe via Simmons, Oct 19 2026): every subscription in
 * `chlk.subscriptions` whose `subscription_status` is `active`, by payment
 * method — App Store, Stripe, invoice — plus the total. Shared by the
 * server route and the browser; the read itself is server only
 * (`src/lib/server/paying-coaches.ts`).
 *
 * Status rules (#50):
 * - `connected`     — read within the cache window; `asOf` is when.
 * - `stale`         — the last read failed; the last good counts.
 * - `connecting`    — a database URL is set, the first read is running.
 * - `not_connected` — no database URL, or it has never answered. No counts,
 *                     never a made-up 0.
 */
export type PayingCounts = {
  appStore: number
  stripe: number
  invoice: number
  /** Active subscriptions with any other method (new or unexpected values). */
  other: number
  /** Distinct coaches with an active subscription, across every method. */
  total: number
}

export type PayingCoachesSummary =
  | { status: "connected" | "stale"; counts: PayingCounts; asOf: string }
  | { status: "connecting" }
  | { status: "not_connected" }

export const PAYING_NOT_CONNECTED: PayingCoachesSummary = { status: "not_connected" }
export const PAYING_CONNECTING: PayingCoachesSummary = { status: "connecting" }
export const PAYING_COACHES_PATH = "/api/subscriptions/paying"

/** `chlk.subscriptions.method` → our key. Exact values, verified read-only Oct 19 2026. */
export const METHOD_KEYS: Record<string, keyof Omit<PayingCounts, "total" | "other">> = {
  AppStore: "appStore",
  Stripe: "stripe",
  invoice: "invoice",
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0

/** Rows of `PAYING_COACHES_SQL` (`method`, `n`, plus a `__total__` row) → counts. Null if anything is off. */
export function countsFromRows(rows: unknown): PayingCounts | null {
  if (!Array.isArray(rows)) return null
  const counts: PayingCounts = { appStore: 0, stripe: 0, invoice: 0, other: 0, total: -1 }
  for (const row of rows) {
    const r = row as { method?: unknown; n?: unknown }
    if (!isCount(r.n)) return null
    if (r.method === TOTAL_ROW) counts.total = r.n
    else if (typeof r.method === "string" && METHOD_KEYS[r.method]) counts[METHOD_KEYS[r.method]] += r.n
    else counts.other += r.n
  }
  return counts.total < 0 ? null : counts
}

/** Marks the rollup row in the query's answer (not a real method). */
export const TOTAL_ROW = "__total__"

/** Read back defensively: anything that is not a complete reading is null. */
export function parsePayingCoaches(value: unknown): PayingCoachesSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return PAYING_NOT_CONNECTED
  if (v.status === "connecting") return PAYING_CONNECTING
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.asOf !== "string" || !Number.isFinite(Date.parse(v.asOf))) return null
  const c = v.counts as Record<string, unknown> | null | undefined
  if (!c || typeof c !== "object") return null
  const keys = ["appStore", "stripe", "invoice", "other", "total"] as const
  if (!keys.every((k) => isCount(c[k]))) return null
  const counts = Object.fromEntries(keys.map((k) => [k, c[k]])) as PayingCounts
  return { status: v.status, counts, asOf: v.asOf }
}

export const PAYING_LABELS = { appStore: "App Store", stripe: "Stripe", invoice: "Invoice", other: "Other" } as const

export type PayingRow = { key: keyof typeof PAYING_LABELS; label: string; value: string }

export type PayingCoachesView =
  | { kind: "loading"; connecting: boolean }
  | { kind: "not_connected" }
  | { kind: "live"; total: string; rows: PayingRow[]; updated: string | null }

const GROUPED = new Intl.NumberFormat("en-US")

/** What the tile shows. `updated` ("Last updated …") only when stale, as the KPI cards do. */
export function payingCoachesView(s: PayingCoachesSummary | null, timeZone: string): PayingCoachesView {
  if (!s) return { kind: "loading", connecting: false }
  if (s.status === "connecting") return { kind: "loading", connecting: true }
  if (s.status === "not_connected") return { kind: "not_connected" }
  const rows: PayingRow[] = (["appStore", "stripe", "invoice"] as const).map((key) => ({
    key,
    label: PAYING_LABELS[key],
    value: GROUPED.format(s.counts[key]),
  }))
  if (s.counts.other > 0) rows.push({ key: "other", label: PAYING_LABELS.other, value: GROUPED.format(s.counts.other) })
  return {
    kind: "live",
    total: GROUPED.format(s.counts.total),
    rows,
    updated: s.status === "stale" ? lastUpdatedLabel(new Date(s.asOf), timeZone) : null,
  }
}
