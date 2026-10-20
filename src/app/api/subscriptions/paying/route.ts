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

/**
 * A request never waits for the database (the read runs in `after()`), and
 * one read is bounded: connect 10 s, statement 10 s, the whole read 20 s
 * (`PAYING_SYNC_TIMEOUT_MS`). 30 s covers that with room; the 300 s the
 * Stripe routes need (a full Stripe sync) would only let a stuck read hold
 * a function open.
 */
export const maxDuration = 30
