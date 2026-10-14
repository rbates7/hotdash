import { stripeService } from "@/lib/server/stripe"
import type { StripeHealth } from "@/lib/stripe-summary"

export const dynamic = "force-dynamic"

/**
 * `{"stripe":"ok"|"unavailable"|"not_configured"}` and nothing else — no
 * figures, no key, no error text — so it is safe to leave public. Reads
 * through the same cache as the summary, so polling it cannot hammer Stripe.
 */
export async function GET() {
  let stripe: StripeHealth
  try {
    stripe = await stripeService.health()
  } catch {
    stripe = "unavailable"
  }
  return Response.json({ stripe }, { headers: { "Cache-Control": "no-store" } })
}
