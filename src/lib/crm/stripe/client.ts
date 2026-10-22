import Stripe from "stripe"

import type { StripeApi } from "./types"

// Requires a restricted key (rk_...) with read-only access to Customers and
// Subscriptions — see docs/SETUP.md §2.
export function createStripeApi(): StripeApi | null {
  const key =
    process.env.CRM_STRIPE_API_KEY?.trim() ||
    process.env.STRIPE_READONLY_KEY?.trim()
  if (!key) return null
  const stripe = new Stripe(key, {
    maxNetworkRetries: 1,
    timeout: 20_000,
    telemetry: false,
    appInfo: { name: "hotdash-crm" },
  })

  return {
    async *listCustomers() {
      for await (const customer of stripe.customers.list({ limit: 100 })) {
        yield {
          id: customer.id,
          email: customer.email ?? null,
          name: customer.name ?? null,
        }
      }
    },
    async *listSubscriptions() {
      for await (const subscription of stripe.subscriptions.list({
        status: "all",
        limit: 100,
      })) {
        const item = subscription.items.data[0]
        const price = item?.price
        yield {
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer.id,
          status: subscription.status,
          priceId: price?.id ?? null,
          productId:
            typeof price?.product === "string"
              ? price.product
              : (price?.product?.id ?? null),
          nickname: price?.nickname ?? null,
          created: subscription.created,
        }
      }
    },
  }
}
