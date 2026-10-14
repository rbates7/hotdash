import { configurePosthogSummary } from "@/hooks/use-posthog-summary"
import type { PosthogSummary } from "@/lib/posthog-summary"

export { LIVE_POSTHOG_METRICS, POSTHOG_SYNCED_AT, livePosthogSummary } from "@/test/posthog-fixture"

/** Start the PostHog store on `summary` (and keep answering it). */
export function setPosthogSummaryForTest(summary: PosthogSummary) {
  configurePosthogSummary({ initial: { phase: "ready", summary }, fetcher: async () => summary })
}

/** Start the PostHog store loading, with an answer that never arrives. */
export function setPosthogLoadingForTest() {
  configurePosthogSummary({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}
