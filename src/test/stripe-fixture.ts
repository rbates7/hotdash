import type { StripeMetrics } from "@/lib/stripe-metrics"
import type { StripeSummary } from "@/lib/stripe-summary"

/**
 * Stripe figures for tests and e2e mocks — pure data, no React, so the
 * Playwright specs can import it too. Never real Stripe data.
 */

/** 9:41 AM CDT, Tue 13 Oct 2026. */
export const SYNCED_AT = "2026-10-13T14:41:00.000Z"

/** Live figures that cannot be mistaken for the sample ones. */
export const LIVE_METRICS: StripeMetrics = {
  subscribers: { value: 1_284, previous: 1_250, today: 3, series: [1_100, 1_150, 1_190, 1_220, 1_250, 1_284] },
  cashThisWeek: { value: 4_321.5, previous: 3_900, since: "2026-10-12T05:00:00.000Z" },
  mrr: { value: 61_234.56, previous: 59_000, series: [52_000, 54_000, 56_000, 57_500, 59_000, 61_234.56] },
  churn: { value: 2.7, previous: 3.1, series: [3.5, 3.4, 3.2, 3.3, 3.1, 2.7], churned: 34, base: 1_250 },
  trialToPaid: { value: 41.2, previous: null, series: [null, null, 30, 35, null, 41.2], converted: 7, ended: 17 },
}

export function liveSummary(status: "connected" | "stale" = "connected", metrics: StripeMetrics = LIVE_METRICS): StripeSummary {
  return { status, lastSyncedAt: SYNCED_AT, metrics }
}
