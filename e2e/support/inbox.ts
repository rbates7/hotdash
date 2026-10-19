import type { Page } from "@playwright/test"

import type { InboxResponse } from "../../src/lib/inbox-sources"
import {
  connectingInbox,
  emptyInbox,
  liveInbox,
  mixedInbox,
  notConnectedInbox,
  staleInbox,
} from "../../src/test/inbox-fixture"

export { connectingInbox, emptyInbox, liveInbox, mixedInbox, notConnectedInbox, staleInbox }

/**
 * Answer the browser's `/api/inbox` with `inbox` — the server's own route
 * (no GitHub or Sentry token in e2e) is never reached, and neither is
 * GitHub or Sentry. The fixture rows are invented PRs and issues.
 */
export async function mockInbox(page: Page, inbox: InboxResponse) {
  let calls = 0
  await page.route("**/api/inbox", async (route) => {
    calls += 1
    await route.fulfill({ json: inbox, headers: { "Cache-Control": "no-store" } })
  })
  return () => calls
}

export const INBOX_STATES = {
  connecting: connectingInbox,
  connected: liveInbox,
  empty: emptyInbox,
  stale: staleInbox,
  mixed: mixedInbox,
  not_connected: notConnectedInbox,
} as const

export type InboxStateName = keyof typeof INBOX_STATES
