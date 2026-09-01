// FILL IN: map Chlk's Stripe price ids (price_...) and/or product ids
// (prod_...) to display names. Unmapped plans fall back to the price
// nickname, then the raw price id.
export const PLAN_LABELS: Record<string, string> = {
  // "price_1ABC...": "Starter",
  // "prod_XYZ...": "Growth",
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
