import { configureStripeSummary } from "@/hooks/use-stripe-summary"
import type { StripeSummary } from "@/lib/stripe-summary"

export { APP_STORE_CONNECTED, APP_STORE_OFF, APP_STORE_STALE, LIVE_METRICS, SYNCED_AT, liveSummary } from "@/test/stripe-fixture"

/** Start every Stripe store on `summary` (and keep answering it). */
export function setStripeSummaryForTest(summary: StripeSummary) {
  configureStripeSummary({ initial: { phase: "ready", summary }, fetcher: async () => summary })
}

/** Start every Stripe store loading, with an answer that never arrives. */
export function setStripeLoadingForTest() {
  configureStripeSummary({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}
