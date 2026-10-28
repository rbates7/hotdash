import { after } from "next/server"

import { emptyAccounts, type AccountsResponse } from "@/lib/crm/accounts/model"
import { accountsService } from "@/lib/server/stripe-accounts"

// Per request, never at build: the build must not call Stripe or the database.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * `GET /api/crm/accounts`: organizations, seats and their users, from
 * Stripe and the CRM database (src/lib/server/stripe-accounts.ts, cached
 * about five minutes on the server). Behind the dashboard gate
 * (src/proxy.ts answers 401 when logged out). Never an error body: a
 * failure is `not_connected`, and the browser never caches it.
 */
export async function GET() {
  after(() => accountsService.settled())
  const body = await accountsService.read().catch((): AccountsResponse => emptyAccounts("not_connected"))
  return Response.json(body, { headers: NO_STORE })
}

export const maxDuration = 300
