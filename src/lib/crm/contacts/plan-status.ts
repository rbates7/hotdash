// Subscription statuses the customer list lets you filter on, with the
// words used for them. Dependency-free so the filter bar can import it.
export const CUSTOMER_PLAN_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
] as const
export type CustomerPlanStatus = (typeof CUSTOMER_PLAN_STATUSES)[number]

export const PLAN_STATUS_LABELS: Record<CustomerPlanStatus, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
}
