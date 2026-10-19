import { after } from "next/server"

import { POSTHOG_NOT_CONNECTED, type PosthogSummary } from "@/lib/posthog-summary"
import { posthogService } from "@/lib/server/posthog"

// Per request, never at build: the build must not call PostHog.
export const dynamic = "force-dynamic"

/**
 * The dashboard's PostHog figures: `{ status, lastSyncedAt, metrics }`.
 * No time zone: the windows are rolling 28 × 24 h, not calendar days.
 * Never an error body: a failure is `stale` or `not_connected`. Never waits
 * for PostHog: a due sync runs after the response (`after`), and the next
 * poll picks it up.
 */
export async function GET() {
  after(() => posthogService.settled())
  const body = await posthogService.summary().catch((): PosthogSummary => POSTHOG_NOT_CONNECTED)
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** The sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
