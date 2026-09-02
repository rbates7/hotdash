// Narrow surface the sync needs; the real implementation wraps the stripe
// SDK's auto-pagination, tests inject fixture-backed fakes.

export type StripeCustomer = {
  id: string
  email: string | null
  name: string | null
}

export type StripeSubscription = {
  customerId: string
  status: string
  priceId: string | null
  productId: string | null
  nickname: string | null
  // Epoch seconds, as Stripe reports them. All required so a client cannot
  // quietly leave one out and have every plan date come back empty.
  created: number
  startDate: number
  trialEnd: number | null
  canceledAt: number | null
  endedAt: number | null
  cancelAtPeriodEnd: boolean
}

export interface StripeApi {
  listCustomers(): AsyncIterable<StripeCustomer>
  listSubscriptions(): AsyncIterable<StripeSubscription>
}

export type StripeSyncStats = {
  customersSeen: number
  contactsCreated: number
  contactsUpdated: number
  plansSet: number
}
