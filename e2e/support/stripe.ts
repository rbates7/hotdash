import type { Page } from "@playwright/test"

import {
  APP_STORE_CONNECTED,
  APP_STORE_OFF,
  APP_STORE_STALE,
  LIVE_METRICS,
  liveSummary,
} from "../../src/test/stripe-fixture"
import type { StripeMetrics } from "../../src/lib/stripe-metrics"
import type { StripeSummary } from "../../src/lib/stripe-summary"

export { APP_STORE_CONNECTED, APP_STORE_OFF, APP_STORE_STALE, LIVE_METRICS, liveSummary }

/**
 * Answer the browser's `/api/stripe/summary` with `summary` — the server's
 * own route (no key and no database URL in e2e) is never reached, and
 * neither is Stripe or Chlk's database. `liveSummary()` has the database
 * connected (1,107 + 53 + 83 + 171 = 1,414); pass `APP_STORE_OFF` as its
 * third argument for not connected (1,278, "Total excludes App Store and
 * invoice").
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

/**
 * Connected (or stale) with a Subscribers total of `count`, flat today: the
 * fixture's free accounts, App Store payers and invoice coaches, and Stripe
 * paying the rest.
 */
export function withSubscribers(count: number, status: "connected" | "stale" = "connected"): StripeSummary {
  const free = LIVE_METRICS.freeAccounts.value
  const app =
    APP_STORE_CONNECTED.status === "not_connected" ? 0 : APP_STORE_CONNECTED.count + (APP_STORE_CONNECTED.invoice ?? 0)
  const metrics: StripeMetrics = {
    ...LIVE_METRICS,
    subscribers: { ...LIVE_METRICS.subscribers, value: count - free - app, today: 0 },
    freeAccounts: { ...LIVE_METRICS.freeAccounts, today: 0 },
  }
  return liveSummary(status, metrics, APP_STORE_CONNECTED)
}
