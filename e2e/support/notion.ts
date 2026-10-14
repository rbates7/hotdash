import type { Page } from "@playwright/test"

import { LIVE_ROADMAP, NOTION_SYNCED_AT, liveRoadmapSummary } from "../../src/test/notion-fixture"
import type { NotionRoadmapSummary } from "../../src/lib/notion-roadmap"

export { LIVE_ROADMAP, NOTION_SYNCED_AT, liveRoadmapSummary }

/**
 * Answer the browser's `/api/notion/roadmap` with `summary` — the server's
 * own route (no token in e2e) is never reached, and neither is Notion.
 * Returns a counter of how many times the page asked.
 */
export async function mockNotion(page: Page, summary: NotionRoadmapSummary | (() => NotionRoadmapSummary | null)) {
  const calls = { count: 0 }
  await page.route("**/api/notion/roadmap**", async (route) => {
    calls.count += 1
    const body = typeof summary === "function" ? summary() : summary
    if (body === null) return route.fulfill({ status: 503, body: "" })
    await route.fulfill({ json: body, headers: { "Cache-Control": "no-store" } })
  })
  return calls
}
