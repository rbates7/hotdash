import type { Page } from "@playwright/test"

import { PAYING_COACHES_PATH, type PayingCoachesSummary } from "../../src/lib/paying-coaches"

/** Fixture counts: made up, never live figures. */
export const PAYING_COUNTS = { appStore: 40, stripe: 900, invoice: 60, other: 0, total: 1000 }

export function livePaying(status: "connected" | "stale" = "connected"): PayingCoachesSummary {
  // Stale: an hour old, so the "Last updated" line has a time to show.
  const asOf = new Date(Date.now() - (status === "stale" ? 3_600_000 : 0)).toISOString()
  return { status, counts: PAYING_COUNTS, asOf }
}

export async function mockPaying(page: Page, summary: PayingCoachesSummary) {
  await page.route(`**${PAYING_COACHES_PATH}`, (route) => route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } }))
}
