import type { WorkboardItem, WorkboardResponse } from "@/lib/workboard"

/**
 * Test-only answers from `GET /api/workboard` (#51's contract). Never
 * rendered in the app: unit tests hand them to the store
 * (`src/test/workboard.ts`) and e2e mocks the route with them
 * (`e2e/support/workboard.ts`).
 */
export const WORKBOARD_FETCHED_AT = "2026-10-17T00:45:00.000Z"

export function workboardItem(over: Partial<WorkboardItem> = {}): WorkboardItem {
  const number = over.number ?? 48
  return {
    number,
    title: "Suspect-zero guard",
    url: `https://github.com/rbates7/hotdash/pull/${number}`,
    owner: "simmons-bot",
    branch: "feat/suspect-zero",
    state: "ready_for_review",
    ci: "passing",
    review: "pending",
    proofLinks: ["https://github.com/user-attachments/assets/example.png"],
    updatedAt: "2026-10-16T22:10:00Z",
    mergedAt: null,
    ...over,
  }
}

/** One row per column, so every column and badge tone is on screen. */
export const LIVE_ITEMS: WorkboardItem[] = [
  workboardItem({ number: 52, title: "Inbox: GitHub and Sentry", owner: "hill-bot", branch: "feat/inbox", state: "working", ci: "pending", review: "none", proofLinks: [] }),
  workboardItem({ number: 50, title: "Connecting state", owner: "koenig-bot", branch: "feat/connecting", state: "needs_fix", ci: "failing", review: "changes_requested", proofLinks: [] }),
  workboardItem(),
  workboardItem({ number: 46, title: "CRM: read-only Gmail source", owner: "rbates7", branch: "feat/crm-gmail", state: "merged", ci: "none", review: "none", proofLinks: [], mergedAt: "2026-10-16T15:00:00Z" }),
]

export function workboardSummary(
  status: WorkboardResponse["status"],
  items: WorkboardItem[] = status === "connected" || status === "stale" ? LIVE_ITEMS : []
): WorkboardResponse {
  const live = status === "connected" || status === "stale"
  return { status, connected: live, stale: status === "stale", fetchedAt: WORKBOARD_FETCHED_AT, items: live ? items : [] }
}
