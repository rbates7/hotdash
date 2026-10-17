import type { PosthogMetrics } from "@/lib/posthog-metrics"
import type { PosthogSummary } from "@/lib/posthog-summary"

/**
 * PostHog figures for tests and e2e mocks — pure data, no React, so the
 * Playwright specs can import it too. Never real PostHog data.
 */

/** 9:41 AM CDT, Tue 13 Oct 2026 — the same instant as the Stripe fixture. */
export const POSTHOG_SYNCED_AT = "2026-10-13T14:41:00.000Z"

/**
 * Live figures that cannot be mistaken for the sample ones: 812 active in
 * the last 28 days (774 before), and 452 of those 774 came back (58.4%).
 * PostHog has about four and a half windows of history, so the oldest
 * points are empty.
 */
export const LIVE_POSTHOG_METRICS: PosthogMetrics = {
  activeUsers: { value: 812, previous: 774, series: [null, null, 610, 702, 774, 812], day: 214, week: 455 },
  retention: {
    value: (452 / 774) * 100,
    previous: 55.1,
    series: [null, null, null, 52, 55.1, (452 / 774) * 100],
    retained: 452,
    base: 774,
  },
  since: "2026-06-01T15:00:00.000Z",
}

export function livePosthogSummary(
  status: "connected" | "stale",
  metrics: PosthogMetrics = LIVE_POSTHOG_METRICS
): PosthogSummary {
  return { status, lastSyncedAt: POSTHOG_SYNCED_AT, metrics }
}
