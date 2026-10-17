import { after } from "next/server"

import { workboardService } from "@/lib/server/workboard"
import { notConnected, type WorkboardResponse } from "@/lib/workboard"

// Per request, never at build: the build must not call GitHub.
export const dynamic = "force-dynamic"

/**
 * The workboard: `{ connected, fetchedAt, stale, items }` (see
 * `WorkboardResponse`). Never an error body: no token, or no sync landed
 * yet, is `connected: false` with no items; a failed sync is the last good
 * items with `stale: true`. A due sync runs after the response (`after`),
 * and the next poll picks it up.
 */
export async function GET() {
  after(() => workboardService.settled())
  const body: WorkboardResponse = await workboardService.read().catch(() => notConnected(new Date()))
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
