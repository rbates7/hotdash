import type { Page } from "@playwright/test"

import { LIVE_POSTHOG_METRICS, POSTHOG_SYNCED_AT, livePosthogSummary } from "../../src/test/posthog-fixture"
import type { PosthogSummary } from "../../src/lib/posthog-summary"

export { LIVE_POSTHOG_METRICS, POSTHOG_SYNCED_AT, livePosthogSummary }

/**
 * Answer the browser's `/api/posthog/summary` with `summary` — the server's
 * own route (no key in e2e) is never reached, and neither is PostHog.
 */
export async function mockPosthog(page: Page, summary: PosthogSummary) {
  await page.route("**/api/posthog/summary**", (route) =>
    route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
  )
}
