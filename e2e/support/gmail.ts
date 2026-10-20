import type { Page } from "@playwright/test"

import type { GmailSummary } from "../../src/lib/crm/gmail-summary"
import { liveGmailSummary } from "../../src/test/gmail-fixture"

export { liveGmailSummary }

/**
 * `/api/crm/gmail` with or without a query string: the summary, and the
 * case panel's `?caseId=<id>` thread read. A glob like `**\/api/crm/gmail`
 * would miss the query string. Pass this to `page.unroute` too.
 */
export const GMAIL_ROUTE = /\/api\/crm\/gmail(\?.*)?$/

/**
 * Answer the browser's `/api/crm/gmail` (and its `?caseId=` thread reads)
 * with `summary` — the server's own route (no Gmail credentials in e2e) is
 * never reached, and neither is Gmail. The thread read gets the same body:
 * the CRM's adapter filters its messages to the case. `liveGmailSummary(
 * Date.now())` is the fixture inbox (invented people and schools), dated
 * from now.
 */
export async function mockGmail(page: Page, summary: GmailSummary) {
  let calls = 0
  await page.route(GMAIL_ROUTE, async (route) => {
    calls += 1
    await route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
  })
  return () => calls
}
