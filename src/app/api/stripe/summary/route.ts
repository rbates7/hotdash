import type { NextRequest } from "next/server"

import { APP_STORE_NOT_CONNECTED, type AppStoreSummary } from "@/lib/app-store-summary"
import { DEFAULT_TIME_ZONE, isTimeZoneId } from "@/lib/clock"
import { appStoreSource } from "@/lib/server/app-store"
import { stripeService } from "@/lib/server/stripe"
import { NOT_CONNECTED, type StripeSummary } from "@/lib/stripe-summary"

// Per request, never at build: the build must not call Stripe.
export const dynamic = "force-dynamic"

/**
 * The dashboard's Stripe figures: `{ status, lastSyncedAt, metrics }`, plus
 * the App Store payer count from Chlk's database in its own `appStore`
 * field (`{ status, count, asOf }` or `{ status: "not_connected" }`).
 * `?tz=` is the founder's Settings zone (one of the offered zones; anything
 * else is Central) — "today" and "this week" start at its midnight.
 * Never an error body: a failure is `stale` or `not_connected`, and the
 * two sources are read side by side, each failing on its own.
 */
export async function GET(request: NextRequest) {
  const tz = request.nextUrl.searchParams.get("tz")
  const [stripe, appStore] = await Promise.all([
    stripeService.summary(isTimeZoneId(tz) ? tz : DEFAULT_TIME_ZONE).catch((): StripeSummary => NOT_CONNECTED),
    appStoreSource()
      .read()
      .catch((): AppStoreSummary => APP_STORE_NOT_CONNECTED),
  ])
  const body: StripeSummary = { ...stripe, appStore }
  return Response.json(body, { headers: { "Cache-Control": "no-store" } })
}

/** A full sync lists every subscription and paid invoice (~3.5 min at 3k subs). */
export const maxDuration = 300
