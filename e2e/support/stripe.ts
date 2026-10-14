import type { Page } from "@playwright/test"

import { liveSummary, LIVE_METRICS } from "../../src/test/stripe-fixture"
import type { StripeMetrics } from "../../src/lib/stripe-metrics"
import type { StripeSummary } from "../../src/lib/stripe-summary"

export { LIVE_METRICS, liveSummary }

/**
 * Answer the browser's `/api/stripe/summary` with `summary` — the server's
 * own route (no key in e2e) is never reached, and neither is Stripe.
 * Returns the time-zone parameters the page asked with.
 */
export async function mockStripe(page: Page, summary: StripeSummary) {
  const zones: string[] = []
  await page.route("**/api/stripe/summary**", async (route) => {
    zones.push(new URL(route.request().url()).searchParams.get("tz") ?? "")
    await route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
  })
  return zones
}

/** Connected (or stale) with `subscribers` active, everything else from the fixture. */
export function withSubscribers(count: number, status: "connected" | "stale" = "connected"): StripeSummary {
  const metrics: StripeMetrics = {
    ...LIVE_METRICS,
    subscribers: { ...LIVE_METRICS.subscribers, value: count, today: 0 },
  }
  return liveSummary(status, metrics)
}
