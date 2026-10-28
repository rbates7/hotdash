import { after } from "next/server"

import type { AccountDetailResponse } from "@/lib/crm/accounts/model"
import { accountsService } from "@/lib/server/stripe-accounts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * `GET /api/crm/accounts/<orgId>`: one organization with its users, from
 * the same cached copy as the list. 404 only when the sources are
 * connected and no organization has that id; otherwise the source's state
 * (`connecting`, `not_connected`) with `org: null`. Behind the gate.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  after(() => accountsService.settled())
  const body = await accountsService
    .detail(orgId)
    .catch((): AccountDetailResponse => ({ status: "not_connected", missing: [], lastSyncedAt: null, lastTriedAt: null, org: null }))
  const live = body.status === "connected" || body.status === "stale"
  return Response.json(body, { status: live && !body.org ? 404 : 200, headers: NO_STORE })
}

export const maxDuration = 300
