import { after, type NextRequest } from "next/server"

import { DEFAULT_TIME_ZONE, isTimeZoneId } from "@/lib/clock"
import { stripeService } from "@/lib/server/stripe"
import { subscriberLists } from "@/lib/server/stripe-subscribers"
import { emptySubscriberList, isSubscriberList, type StripeSubscriberListResponse } from "@/lib/stripe-subscribers"

// Per request, never at build: the build must not call Stripe.
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * `GET /api/stripe/subscribers?list=new|churned&tz=<zone>`: the New or
 * Churned Subscribers list for the current 28-day window, with customer
 * names and emails looked up on the server. Behind the dashboard gate
 * (src/proxy.ts answers 401 when logged out). A missing or unknown `list`
 * is 400. Never an error body otherwise: a failure is `not_connected`.
 * The server caches briefly (src/lib/server/stripe-subscribers.ts); the
 * browser never caches it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const list = params.get("list")
  if (!isSubscriberList(list)) return Response.json({ error: "bad_list" }, { status: 400, headers: NO_STORE })
  const tz = params.get("tz")
  after(() => stripeService.settled())
  const body = await subscriberLists
    .read(list, isTimeZoneId(tz) ? tz : DEFAULT_TIME_ZONE)
    .catch((): StripeSubscriberListResponse => emptySubscriberList(list))
  return Response.json(body, { headers: NO_STORE })
}

export const maxDuration = 30
