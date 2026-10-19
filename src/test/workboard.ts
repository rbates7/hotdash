import { configureWorkboard } from "@/hooks/use-workboard"
import type { WorkboardResponse } from "@/lib/workboard"

export { LIVE_ITEMS, WORKBOARD_FETCHED_AT, workboardItem, workboardSummary } from "@/test/workboard-fixture"

/** Start the workboard store on `summary` (and keep answering it). */
export function setWorkboardForTest(summary: WorkboardResponse) {
  configureWorkboard({ initial: { phase: "ready", summary }, fetcher: async () => summary })
}

/** Start the workboard store loading, with an answer that never arrives. */
export function setWorkboardLoadingForTest() {
  configureWorkboard({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}
