// Chlk live-mode catalog, verified through Stripe on 2026-10-21.
// Product mappings cover future prices for the same plans; price mappings
// retain the intended label if a product is ever replaced.
export const PLAN_LABELS: Record<string, string> = {
  price_1TgsbODtAjmN4bYimyyoCQuC: "Staff",
  price_1TgsbODtAjmN4bYiiIK7sTPQ: "Staff",
  price_1TgsbODtAjmN4bYi8nOhcRvQ: "Staff",
  prod_UgF5PgksiSygJq: "Staff",
  price_1TVwjWDtAjmN4bYiqb8WX8sh: "Annual",
  price_1PJ7ktDtAjmN4bYiXmSkOJgt: "Annual",
  prod_Q9QcuvwIwiqZ3C: "Annual",
  price_1TVwiFDtAjmN4bYiBywBl3sf: "Monthly",
  price_1PJ7iaDtAjmN4bYiaQMVMRNJ: "Monthly",
  price_1OaCf2DtAjmN4bYi0l4WRUVp: "Monthly",
  prod_Q9QZm6YVzbNEAl: "Monthly",
  prod_PP0gjGGanXjyVl: "Monthly",
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
