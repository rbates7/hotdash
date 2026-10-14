import { after } from "next/server"

import { gmailNotConnected, type GmailSummary } from "@/lib/crm/gmail-summary"
import { gmailService } from "@/lib/server/gmail"

// Per request, never at build: the build must not call Gmail.
export const dynamic = "force-dynamic"

/**
 * The CRM's support inbox: `{ status, lastSyncedAt, mailbox, data }`, with
 * `data` the inbox's threads as CRM rows (organizations, contacts, cases,
 * messages) or null when not connected. Never an error body: a failure is
 * `stale` or `not_connected`, and the CRM keeps its labelled sample. Never
 * waits for Gmail: a due sync runs after the response (`after`), and the
 * next poll picks it up.
 */
export async function GET() {
  after(() => gmailService.settled())
  const body = await gmailService.summary().catch((): GmailSummary => gmailNotConnected())
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
