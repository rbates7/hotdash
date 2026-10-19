import { configureNotionRoadmap } from "@/hooks/use-notion-roadmap"
import type { NotionRoadmapSummary } from "@/lib/notion-roadmap"

export { LIVE_ROADMAP, NOTION_SYNCED_AT, liveRoadmapSummary, notionRow } from "@/test/notion-fixture"

/** Start the Notion roadmap store on `summary` (and keep answering it). */
export function setNotionRoadmapForTest(summary: NotionRoadmapSummary) {
  configureNotionRoadmap({ initial: { phase: "ready", summary }, fetcher: async () => summary })
}

/** Start the Notion roadmap store loading, with an answer that never arrives. */
export function setNotionLoadingForTest() {
  configureNotionRoadmap({ initial: { phase: "loading" }, fetcher: () => new Promise(() => {}) })
}
