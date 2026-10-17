import { after } from "next/server"

import type { NotionHealth } from "@/lib/notion-roadmap"
import { notionService } from "@/lib/server/notion"

export const dynamic = "force-dynamic"

/**
 * `{"notion":"ok"|"unavailable"|"not_configured"}` and nothing else — no
 * rows, no token, no page id, no error text — so it is safe to leave
 * public. Reads through the same cache as the roadmap, so polling it cannot
 * hammer Notion.
 */
export async function GET() {
  after(() => notionService.settled())
  let notion: NotionHealth
  try {
    notion = await notionService.health()
  } catch {
    notion = "unavailable"
  }
  return Response.json({ notion }, { headers: { "Cache-Control": "no-store" } })
}

/** The sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s), under this. */
export const maxDuration = 300
