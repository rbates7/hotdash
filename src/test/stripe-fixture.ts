import type { AppStoreSummary } from "@/lib/app-store-summary"
import type { StripeMetrics } from "@/lib/stripe-metrics"
import type { StripeSummary } from "@/lib/stripe-summary"

/**
 * Stripe figures for tests and e2e mocks — pure data, no React, so the
 * Playwright specs can import it too. Never real Stripe data.
 */

/** 9:41 AM CDT, Tue 13 Oct 2026. */
export const SYNCED_AT = "2026-10-13T14:41:00.000Z"

/**
 * Live figures that cannot be mistaken for the sample ones. Subscribers:
 * 1,107 Stripe paying + 171 free = 1,278 without Chlk's database, 1,414
 * with its 53 active App Store payers and 83 invoice coaches
 * (`APP_STORE_CONNECTED`). Previous 1,380 and today +3 on the total.
 */
export const LIVE_METRICS: StripeMetrics = {
  subscribers: { value: 1_107, previous: 1_077, today: 2, series: [937, 987, 1_027, 1_057, 1_077, 1_107] },
  freeAccounts: { value: 171, previous: 167, today: 1, series: [147, 155, 160, 164, 167, 171] },
  cashThisWeek: { value: 4_321.5, previous: 3_900, since: "2026-10-12T05:00:00.000Z" },
  mrr: { value: 61_234.56, previous: 59_000, series: [52_000, 54_000, 56_000, 57_500, 59_000, 61_234.56] },
  churn: { value: 2.7, previous: 3.1, series: [3.5, 3.4, 3.2, 3.3, 3.1, 2.7], churned: 34, base: 1_250 },
  trialToPaid: { value: 41.2, previous: null, series: [null, null, 30, 35, null, 41.2], converted: 7, ended: 17 },
}

/** Chlk's database answering with prod's Oct 14 active counts: 53 App Store, 83 invoice. */
export const APP_STORE_CONNECTED: AppStoreSummary = { status: "connected", count: 53, invoice: 83, asOf: SYNCED_AT }
export const APP_STORE_STALE: AppStoreSummary = { ...APP_STORE_CONNECTED, status: "stale" }
export const APP_STORE_OFF: AppStoreSummary = { status: "not_connected" }

/** Stripe `status` with these figures; the App Store connected unless said otherwise. */
export function liveSummary(
  status: "connected" | "stale" = "connected",
  metrics: StripeMetrics = LIVE_METRICS,
  appStore: AppStoreSummary = APP_STORE_CONNECTED
): StripeSummary {
  return { status, lastSyncedAt: SYNCED_AT, metrics, appStore }
}
