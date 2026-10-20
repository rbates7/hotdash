import type { AppStoreSummary } from "@/lib/app-store-summary"
import type { StripeMetricExtras, StripeMetrics } from "@/lib/stripe-metrics"
import type { StripeSubscriberList, StripeSubscriberRow, SubscriberListKind } from "@/lib/stripe-subscribers"
import type { StripeSummary } from "@/lib/stripe-summary"

/**
 * Stripe figures for tests and e2e mocks — pure data, no React, so the
 * Playwright specs can import it too. Never real Stripe data.
 */

/** 9:41 AM CDT, Tue 13 Oct 2026. */
export const SYNCED_AT = "2026-10-13T14:41:00.000Z"

/**
 * Live figures that cannot be mistaken for the sample ones. Subscribers is
 * Bobbi's Oct 14 split: 1,110 Stripe paying + 174 free = 1,284 without the
 * App Store, 1,337 with its 53 (`APP_STORE_CONNECTED`). Previous 1,303 and
 * today +3 on the total.
 */
export const LIVE_METRICS: StripeMetrics = {
  subscribers: { value: 1_110, previous: 1_080, today: 2, series: [940, 990, 1_030, 1_060, 1_080, 1_110] },
  freeAccounts: { value: 174, previous: 170, today: 1, series: [150, 158, 163, 167, 170, 174] },
  cashThisWeek: { value: 4_321.5, previous: 3_900, since: "2026-10-12T05:00:00.000Z" },
  mrr: { value: 61_234.56, previous: 59_000, series: [52_000, 54_000, 56_000, 57_500, 59_000, 61_234.56] },
  churn: { value: 2.7, previous: 3.1, series: [3.5, 3.4, 3.2, 3.3, 3.1, 2.7], churned: 34, base: 1_250 },
  trialToPaid: { value: 41.2, previous: null, series: [null, null, 30, 35, null, 41.2], converted: 7, ended: 17 },
  pastDue: { value: 31, mrr: 1_519 },
  arr: { value: 734_814.72, previous: 708_000, series: [624_000, 648_000, 672_000, 690_000, 708_000, 734_814.72] },
  revenue: { value: 58_765.43, previous: 55_100, series: [47_000, 49_500, 51_200, 53_800, 55_100, 58_765.43], invoices: 1_204 },
  arpu: { value: 55.17, previous: 54.63 },
  ltv: { value: 1_885.36, previous: 1_617.12 },
  nrr: { value: 98.6, previous: 97.9, series: [97.1, 97.5, 98, 97.2, 97.9, 98.6], basis: "current_prices" },
  trialsStartedPerDay: {
    series: Array.from({ length: 28 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10), count: i % 4 })),
    total: 42,
    previousTotal: 39,
  },
}

/** The pre-#77 shape (core figures only), as a cached summary from before the deploy may hold. */
export const LIVE_METRICS_CORE = Object.fromEntries(
  Object.entries(LIVE_METRICS).filter(([k]) => !["pastDue", "arr", "revenue", "arpu", "ltv", "nrr", "trialsStartedPerDay"].includes(k))
) as unknown as StripeMetrics

/** The App Store source answering with Bobbi's Oct 14 count. */
export const APP_STORE_CONNECTED: AppStoreSummary = { status: "connected", count: 53, asOf: SYNCED_AT }
export const APP_STORE_STALE: AppStoreSummary = { ...APP_STORE_CONNECTED, status: "stale" }
export const APP_STORE_OFF: AppStoreSummary = { status: "not_connected" }
/** Connected, but read 0: what a read-only role blocked by RLS sees. Suspect, never a real count. */
export const APP_STORE_ZERO: AppStoreSummary = { status: "connected", count: 0, asOf: SYNCED_AT }
export const APP_STORE_ZERO_STALE: AppStoreSummary = { status: "stale", count: 0, asOf: SYNCED_AT }

/** Stripe `status` with these figures; the App Store connected unless said otherwise. */
export function liveSummary(
  status: "connected" | "stale" = "connected",
  metrics: StripeMetrics = LIVE_METRICS,
  appStore: AppStoreSummary = APP_STORE_CONNECTED
): StripeSummary {
  return { status, lastSyncedAt: SYNCED_AT, metrics, appStore }
}

/** A URL is set and the first count is still running: no count yet. */
export const APP_STORE_CONNECTING: AppStoreSummary = { status: "connecting" }
/** A key is set and Stripe's first sync is still running (a fresh server). */
export function connectingSummary(appStore: AppStoreSummary = APP_STORE_CONNECTING): StripeSummary {
  return { status: "connecting", lastSyncedAt: null, metrics: null, appStore }
}

/* ------------------------------------- Hill's provisional fields (fixtures) */

/** 28 founder-zone days ending Tue 13 Oct 2026 (the fixture's sync day), oldest first. */
const TRIAL_COUNTS = [1, 0, 2, 1, 3, 0, 1, 2, 2, 0, 1, 4, 2, 1, 0, 3, 2, 1, 1, 2, 0, 2, 3, 1, 2, 1, 0, 2]
export const TRIAL_DAYS = TRIAL_COUNTS.map((count, i) => {
  const d = new Date(Date.UTC(2026, 8, 16 + i))
  return { date: d.toISOString().slice(0, 10), count }
})

/**
 * Every optional field, with figures that cannot pass for real ones.
 * ARR is MRR × 12; Trials per day totals 40 against 32 before.
 */
export const LIVE_EXTRAS: Required<StripeMetricExtras> = {
  pastDue: { value: 12, mrr: 480 },
  arr: { value: 734_814.72, previous: 708_000, series: [624_000, 648_000, 672_000, 690_000, 708_000, 734_814.72] },
  revenue: { value: 63_410, previous: 60_250, series: [51_000, 53_900, 55_400, 58_100, 60_250, 63_410], invoices: 1_204 },
  arpu: { value: 55.17, previous: 54.63 },
  ltv: { value: 1_874.12, previous: 1_604.5 },
  nrr: { value: 101.4, previous: 99.8, series: [98.2, 99.1, 100.5, 99.3, 99.8, 101.4], basis: "current_prices" },
  trialsStartedPerDay: { series: TRIAL_DAYS, total: TRIAL_COUNTS.reduce((a, b) => a + b, 0), previousTotal: 32 },
}

/** `LIVE_METRICS` with every provisional field. */
export const LIVE_METRICS_FULL: StripeMetrics = { ...LIVE_METRICS, ...LIVE_EXTRAS }

/* ----------------------------------------- the subscriber lists (fixtures) */


/** The current 28-day window ending at the sync. */
export const LIST_WINDOW = { start: "2026-09-15T05:00:00.000Z", end: SYNCED_AT }

/** Fictional coaches at example.com; one with no name, one with neither name nor email. */
export const NEW_ROWS: StripeSubscriberRow[] = [
  { subscriptionId: "sub_test_new_1", customerName: "Avery Coach", customerEmail: "avery@example.com", plan: "Coach Pro", interval: "month", mrr: 49, at: "2026-10-12T15:00:00.000Z", reason: null },
  { subscriptionId: "sub_test_new_2", customerName: null, customerEmail: "no-name@example.com", plan: "Coach Pro", interval: "year", mrr: 41.58, at: "2026-10-05T15:00:00.000Z", reason: null },
  { subscriptionId: "sub_test_new_3", customerName: null, customerEmail: null, plan: null, interval: null, mrr: 49, at: "2026-09-20T15:00:00.000Z", reason: null },
]

export const CHURNED_ROWS: StripeSubscriberRow[] = [
  { subscriptionId: "sub_test_churn_1", customerName: "Blake Coach", customerEmail: "blake@example.com", plan: "Coach Pro", interval: "month", mrr: 49, at: "2026-10-11T15:00:00.000Z", reason: "cancellation_requested" },
  { subscriptionId: "sub_test_churn_2", customerName: null, customerEmail: "lapsed@example.com", plan: "Coach Pro", interval: "month", mrr: 49, at: "2026-10-02T15:00:00.000Z", reason: "payment_failed" },
]

export function subscriberList(
  list: SubscriberListKind,
  status: "connected" | "stale" = "connected",
  rows: StripeSubscriberRow[] = list === "new" ? NEW_ROWS : CHURNED_ROWS,
  total = rows.length
): StripeSubscriberList {
  return { status, lastSyncedAt: SYNCED_AT, list, window: LIST_WINDOW, total, rows }
}
