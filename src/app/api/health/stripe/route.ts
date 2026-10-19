import { after } from "next/server"

import { stripeService } from "@/lib/server/stripe"
import type { StripeHealth } from "@/lib/stripe-summary"

export const dynamic = "force-dynamic"

/**
 * `{"stripe":"ok"|"unavailable"|"not_configured"}` and nothing else — no
 * figures, no key, no error text — so it is safe to leave public. Reads
 * through the same cache as the summary, so polling it cannot hammer Stripe.
 */
export async function GET() {
  after(() => stripeService.settled())
  let stripe: StripeHealth
  try {
    stripe = await stripeService.health()
  } catch {
    stripe = "unavailable"
  }
  return Response.json({ stripe }, { headers: { "Cache-Control": "no-store" } })
}

/**
 * A full sync lists every subscription and paid invoice (~3.5 min at 3k
 * subs). It runs after the response, cut off at `SYNC_TIMEOUT_MS` (240 s).
 */
export const maxDuration = 300
