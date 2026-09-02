/**
 * Lists the Stripe prices your subscriptions actually reference, so the
 * display names in src/lib/crm/stripe/plan-map.ts can be filled in.
 *
 *   pnpm crm:plans
 *
 * Reads subscriptions only — the same permission the sync already has — so
 * no extra Stripe access is needed to find these ids.
 */
import { createStripeApi } from "../src/lib/crm/stripe/client"
import { PLAN_LABELS } from "../src/lib/crm/stripe/plan-map"

const api = createStripeApi()
if (!api) {
  console.error("STRIPE_API_KEY is not set — nothing to list.")
  process.exit(1)
}

type Row = {
  priceId: string | null
  productId: string | null
  nickname: string | null
  total: number
  active: number
}

const rows = new Map<string, Row>()
for await (const subscription of api.listSubscriptions()) {
  const key = subscription.priceId ?? subscription.productId ?? "(none)"
  const row = rows.get(key) ?? {
    priceId: subscription.priceId,
    productId: subscription.productId,
    nickname: subscription.nickname,
    total: 0,
    active: 0,
  }
  row.total += 1
  if (subscription.status === "active" || subscription.status === "trialing") {
    row.active += 1
  }
  rows.set(key, row)
}

const sorted = [...rows.values()].sort((a, b) => b.active - a.active)
console.log(`\n${sorted.length} distinct plan${sorted.length === 1 ? "" : "s"} in use\n`)

for (const row of sorted) {
  const label =
    (row.priceId && PLAN_LABELS[row.priceId]) ||
    (row.productId && PLAN_LABELS[row.productId]) ||
    null
  console.log(`  ${row.active} active / ${row.total} total`)
  console.log(`    price   ${row.priceId ?? "—"}`)
  console.log(`    product ${row.productId ?? "—"}`)
  console.log(`    nickname ${row.nickname ?? "—"}`)
  console.log(`    shows as ${label ?? row.nickname ?? row.priceId ?? "—"}${label ? "" : "   ← unmapped"}`)
  console.log()
}

const unmapped = sorted.filter(
  (row) =>
    !(row.priceId && PLAN_LABELS[row.priceId]) &&
    !(row.productId && PLAN_LABELS[row.productId])
)
if (unmapped.length > 0) {
  console.log("Paste these into PLAN_LABELS in src/lib/crm/stripe/plan-map.ts:\n")
  for (const row of unmapped) {
    console.log(`  "${row.priceId ?? row.productId}": "",  // ${row.nickname ?? "?"} — ${row.active} active`)
  }
  console.log("\nThen re-run the Stripe sync to relabel existing customers.\n")
}
