import { CASE_ID } from "@/lib/crm/crm"
import { gmailNotConnected } from "@/lib/crm/gmail-summary"
import { emptyCrmList } from "@/lib/crm/gmail-view"

// Legacy compatibility only. The durable CRM reads Gmail from Postgres via
// its server modules, so this endpoint must not run the retired in-memory
// sync pipeline and compete for Gmail quota.
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
  const caseId = request ? new URL(request.url).searchParams.get("caseId") : null
  if (caseId !== null) {
    if (!CASE_ID.test(caseId)) return Response.json({ error: "bad_case_id" }, { status: 400, headers: NO_STORE })
    return Response.json(
      { status: "not_connected", lastUpdated: null, caseId, messages: [] },
      { headers: NO_STORE }
    )
  }
  return Response.json(
    { ...gmailNotConnected(), lastUpdated: null, ...emptyCrmList() },
    { headers: NO_STORE }
  )
}
