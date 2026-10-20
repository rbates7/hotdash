import { after } from "next/server"

import { CASE_ID } from "@/lib/crm/crm"
import { gmailNotConnected } from "@/lib/crm/gmail-summary"
import { emptyCrmList } from "@/lib/crm/gmail-view"
import type { CrmThreadResponse } from "@/lib/crm/types"
import { gmailService } from "@/lib/server/gmail"

// Per request, never at build: the build must not call Gmail.
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * The CRM's support inbox, behind the dashboard gate (src/proxy.ts answers
 * 401 when logged out). Contract: `src/lib/crm/types.ts`.
 *
 * - `GET /api/crm/gmail` — `CrmListResponse` (cases, accounts,
 *   recentActivity, counts), plus the older `lastSyncedAt`/`mailbox`/`data`
 *   fields the current CRM screens read. Never waits for Gmail: a due sync
 *   runs after the response.
 * - `GET /api/crm/gmail?caseId=case-<n>` — `CrmThreadResponse`: that case's
 *   messages with bodies, fetched on demand and cached 5 minutes.
 *
 * Never an error body or error text: a failure is `stale` or `not_connected`.
 */
export async function GET(request?: Request) {
  after(() => gmailService.settled())
  const caseId = request ? new URL(request.url).searchParams.get("caseId") : null
  if (caseId !== null) {
    if (!CASE_ID.test(caseId)) return Response.json({ error: "bad_case_id" }, { status: 400, headers: NO_STORE })
    const body = await gmailService
      .thread(caseId)
      .catch((): CrmThreadResponse => ({ status: "not_connected", lastUpdated: null, caseId, messages: [] }))
    if (!body) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
    return Response.json(body, { headers: NO_STORE })
  }
  const body = await gmailService.list().catch(() => ({ ...gmailNotConnected(), lastUpdated: null, ...emptyCrmList() }))
  return Response.json(body, { headers: NO_STORE })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
