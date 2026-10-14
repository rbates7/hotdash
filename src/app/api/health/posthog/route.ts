import { after } from "next/server"

import type { PosthogHealth } from "@/lib/posthog-summary"
import { posthogService } from "@/lib/server/posthog"

export const dynamic = "force-dynamic"

/**
 * `{"posthog":"ok"|"unavailable"|"not_configured"}` and nothing else — no
 * figures, no key, no project id, no error text — so it is safe to leave
 * public. Reads through the same cache as the summary, so polling it
 * cannot hammer PostHog.
 */
export async function GET() {
  after(() => posthogService.settled())
  let posthog: PosthogHealth
  try {
    posthog = await posthogService.health()
  } catch {
    posthog = "unavailable"
  }
  return Response.json({ posthog }, { headers: { "Cache-Control": "no-store" } })
}

/** The sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
