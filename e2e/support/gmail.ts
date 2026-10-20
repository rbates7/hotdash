import type { Page } from "@playwright/test"

import type { GmailSummary } from "../../src/lib/crm/gmail-summary"
import { crmRouteBody, crmThreadFromGmail } from "../../src/test/crm-fixture"
import { liveGmailSummary } from "../../src/test/gmail-fixture"

export { liveGmailSummary }

/**
 * `/api/crm/gmail` with or without a query string: the summary, and the
 * case panel's `?caseId=<id>` thread read. A glob like `**\/api/crm/gmail`
 * would miss the query string. Pass this to `page.unroute` too.
 */
export const GMAIL_ROUTE = /\/api\/crm\/gmail(\?.*)?$/

/**
 * Answer the browser's `/api/crm/gmail` the way the real route does (the
 * server's own route has no Gmail credentials in e2e, and Gmail is never
 * reached):
 *
 * - the list is Hill's `CrmListResponse` built from `summary`, plus the
 *   older `lastSyncedAt` / `mailbox` / `data` fields develop's store (header
 *   menu, Contacts, Triage) reads;
 * - `?caseId=case-<n>` is that case's `CrmThreadResponse` (plain text), 404
 *   for an unknown case and 400 for a malformed id.
 *
 * `liveGmailSummary(Date.now())` is the fixture inbox (invented people and
 * schools), dated from now.
 */
export async function mockGmail(page: Page, summary: GmailSummary) {
  let calls = 0
  await page.route(GMAIL_ROUTE, async (route) => {
    calls += 1
    const caseId = new URL(route.request().url()).searchParams.get("caseId")
    const headers = { "Cache-Control": "no-store" }
    if (caseId === null) {
      await route.fulfill({ json: crmRouteBody(summary, Date.now()), headers })
      return
    }
    if (!/^case-\d+$/.test(caseId)) {
      await route.fulfill({ status: 400, json: { error: "bad_case_id" }, headers })
      return
    }
    const thread = crmThreadFromGmail(summary, caseId)
    await route.fulfill(thread ? { json: thread, headers } : { status: 404, json: { error: "not_found" }, headers })
  })
  return () => calls
}
