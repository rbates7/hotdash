import { after } from "next/server"

import { workboardService } from "@/lib/server/workboard"
import { notConnected, type WorkboardResponse } from "@/lib/workboard"

// Per request, never at build: the build must not call GitHub.
export const dynamic = "force-dynamic"

/**
 * The workboard: `{ status, connected, fetchedAt, stale, items }` (see
 * `WorkboardResponse`). Never an error body: with a token, before the first
 * sync lands, it is `connecting`; no token, or a first sync that failed, is
 * `not_connected` with no items; a failed sync after a good one is the last
 * good items, `stale`. A due sync runs after the response (`after`), and
 * the next poll picks it up.
 */
export async function GET() {
  after(() => workboardService.settled())
  const body: WorkboardResponse = await workboardService.read().catch(() => notConnected(new Date()))
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
