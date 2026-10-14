import { after } from "next/server"

import type { GmailHealth } from "@/lib/crm/gmail-summary"
import { gmailService } from "@/lib/server/gmail"

export const dynamic = "force-dynamic"

/**
 * `{"gmail":"ok"|"error"|"not_configured"}` and nothing else — no
 * mail, no client ID, no token, no error text — so it is safe to leave
 * public. Reads through the same cache as the CRM route, so polling it
 * cannot hammer Gmail.
 */
export async function GET() {
  after(() => gmailService.settled())
  let gmail: GmailHealth
  try {
    gmail = await gmailService.health()
  } catch {
    gmail = "error"
  }
  return Response.json({ gmail }, { headers: { "Cache-Control": "no-store" } })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
