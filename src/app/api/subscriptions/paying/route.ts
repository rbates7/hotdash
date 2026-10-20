import { after } from "next/server"

import { PAYING_NOT_CONNECTED, type PayingCoachesSummary } from "@/lib/paying-coaches"
import { payingSource } from "@/lib/server/paying-coaches"

// Per request, never at build: the build must not read the database.
export const dynamic = "force-dynamic"

/**
 * Paying coaches (active subscriptions) by method plus the total. Counts
 * only — no names, ids or database URL. `connecting` while the first read
 * runs, `not_connected` with no URL. Never an error body.
 */
export async function GET() {
  after(() => payingSource().settled?.())
  const body: PayingCoachesSummary = await payingSource()
    .read()
    .catch((): PayingCoachesSummary => PAYING_NOT_CONNECTED)
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

export const maxDuration = 300
