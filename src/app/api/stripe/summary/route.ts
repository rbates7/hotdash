import type { NextRequest } from "next/server"

import { DEFAULT_TIME_ZONE, isTimeZoneId } from "@/lib/clock"
import { stripeService } from "@/lib/server/stripe"
import { NOT_CONNECTED } from "@/lib/stripe-summary"

// Per request, never at build: the build must not call Stripe.
export const dynamic = "force-dynamic"

/**
 * The dashboard's Stripe figures: `{ status, lastSyncedAt, metrics }`.
 * `?tz=` is the founder's Settings zone (one of the offered zones; anything
 * else is Central) — "today" and "this week" start at its midnight.
 * Never an error body: a failure is `stale` or `not_connected`.
 */
export async function GET(request: NextRequest) {
  const tz = request.nextUrl.searchParams.get("tz")
  let body
  try {
    body = await stripeService.summary(isTimeZoneId(tz) ? tz : DEFAULT_TIME_ZONE)
  } catch {
    body = NOT_CONNECTED
  }
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}
