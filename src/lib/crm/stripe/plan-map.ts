// Chlk's Stripe price ids → the names you actually call these plans.
// Anything unmapped falls back to the price nickname, then the raw price id —
// which is what put "price_1PJ7ia…" in the Plan column on the customer list.
//
// To find an id that is still showing raw: `pnpm crm:plans` lists every price
// your subscriptions reference, with its nickname and active count. After
// adding one here, re-sync Stripe from CRM → Settings to relabel existing
// customers; the sync rewrites a contact's plan whenever the label changes.
export const PLAN_LABELS: Record<string, string> = {
  price_1PJ7iaDtAjmN4bYiaQMVMRNJ: "Monthly Webapp",
  price_1PJ7ktDtAjmN4bYiXmSkOJgt: "Yearly Webapp",
  price_1TgsbODtAjmN4bYiiIK7sTPQ: "2-4 seat Staff",
  price_1TgsbODtAjmN4bYi8nOhcRvQ: "5-9 seat Staff",
  price_1TgsbODtAjmN4bYimyyoCQuC: "10+ seat Staff",
}

export function planLabelFor(subscription: {
  priceId: string | null
  productId: string | null
  nickname: string | null
}): string | null {
  if (subscription.priceId && PLAN_LABELS[subscription.priceId]) {
    return PLAN_LABELS[subscription.priceId]!
  }
  if (subscription.productId && PLAN_LABELS[subscription.productId]) {
    return PLAN_LABELS[subscription.productId]!
  }
  return subscription.nickname ?? subscription.priceId ?? null
}
