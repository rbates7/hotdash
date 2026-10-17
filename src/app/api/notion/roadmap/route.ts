import { after } from "next/server"

import { NOTION_NOT_CONNECTED, type NotionRoadmapSummary } from "@/lib/notion-roadmap"
import { notionService } from "@/lib/server/notion"

// Per request, never at build: the build must not call Notion.
export const dynamic = "force-dynamic"

/**
 * The Roadmap from Notion: `{ status, lastSyncedAt, roadmap }`, mapped rows
 * only. Never an error body: a failure is `stale` or `not_connected`. Never
 * waits for Notion: a due sync runs after the response (`after`), and the
 * next poll picks it up.
 */
export async function GET() {
  after(() => notionService.settled())
  const body = await notionService.roadmap().catch((): NotionRoadmapSummary => NOTION_NOT_CONNECTED)
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** The sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s), under this. */
export const maxDuration = 300
