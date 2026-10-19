import type { Page } from "@playwright/test"

import type { GmailSummary } from "../../src/lib/crm/gmail-summary"
import { liveGmailSummary } from "../../src/test/gmail-fixture"

export { liveGmailSummary }

/**
 * Answer the browser's `/api/crm/gmail` with `summary` — the server's own
 * route (no Gmail credentials in e2e) is never reached, and neither is
 * Gmail. `liveGmailSummary(Date.now())` is the fixture inbox (invented
 * people and schools), dated from now.
 */
export async function mockGmail(page: Page, summary: GmailSummary) {
  let calls = 0
  await page.route("**/api/crm/gmail", async (route) => {
    calls += 1
    await route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
  })
  return () => calls
}
