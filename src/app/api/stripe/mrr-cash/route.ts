import { after, type NextRequest } from "next/server"

import { DEFAULT_TIME_ZONE, isTimeZoneId } from "@/lib/clock"
import { stripeService } from "@/lib/server/stripe"
import { MRR_CASH_NOT_CONNECTED, type MrrCashSummary } from "@/lib/stripe-mrr-cash"

// Per request, never at build: the build must not call Stripe.
export const dynamic = "force-dynamic"

/**
 * The MRR chart (one point per month) and Cash this week by day, from the
 * same server-side Stripe cache as `/api/stripe/summary` — no extra Stripe
 * calls. `{ status: "connecting" }` while the first sync runs, never sample
 * figures. `?tz=` as for the summary. Never an error body.
 */
export async function GET(request: NextRequest) {
  const tz = request.nextUrl.searchParams.get("tz")
  after(() => stripeService.settled())
  const body: MrrCashSummary = await stripeService
    .mrrCash(isTimeZoneId(tz) ? tz : DEFAULT_TIME_ZONE)
    .catch((): MrrCashSummary => MRR_CASH_NOT_CONNECTED)
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** A sync runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s). */
export const maxDuration = 300
