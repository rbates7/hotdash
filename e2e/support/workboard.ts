import type { Page } from "@playwright/test"

import type { WorkboardResponse } from "../../src/lib/workboard"
import { LIVE_ITEMS, WORKBOARD_FETCHED_AT, workboardItem, workboardSummary } from "../../src/test/workboard-fixture"

export { LIVE_ITEMS, WORKBOARD_FETCHED_AT, workboardItem, workboardSummary }

/**
 * Answer the browser's `/api/workboard` with `summary` — the server's own
 * route (no GitHub token in e2e) is never reached, and neither is GitHub.
 * The fixture rows are invented PRs. `null` answers 503 (our endpoint
 * down). Returns a counter of how many times the page asked.
 */
export async function mockWorkboard(page: Page, summary: WorkboardResponse | null | (() => WorkboardResponse | null)) {
  const calls = { count: 0 }
  await page.route("**/api/workboard", async (route) => {
    calls.count += 1
    const body = typeof summary === "function" ? summary() : summary
    if (body === null) return route.fulfill({ status: 503, body: "" })
    await route.fulfill({ json: body, headers: { "Cache-Control": "no-store" } })
  })
  return calls
}

/**
 * The board's states for e2e and stills. `not_connected` is mocked to `null`
 * here = the real server, which has no token in e2e and so answers
 * not_connected itself.
 */
export const WORKBOARD_STATES = {
  connecting: () => workboardSummary("connecting"),
  not_connected: () => null,
  empty: () => workboardSummary("connected", []),
  live: () => workboardSummary("connected"),
  stale: () => workboardSummary("stale"),
} as const

export type WorkboardStateName = keyof typeof WORKBOARD_STATES

export const WORKBOARD_URL = "/agent-workplace?tab=workboard"
