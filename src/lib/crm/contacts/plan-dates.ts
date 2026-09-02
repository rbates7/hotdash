// The one date that matters for a customer's plan: when it started for
// someone still paying, when it ended for someone who left. A trial shows
// the day paying begins, which is in the future until it does.

const ACTIVE = new Set(["active", "trialing", "past_due"])

export type PlanDateLabel = {
  /** "Started", "Starts" or "Ended". */
  label: string
  date: Date
  /** True for a plan that has stopped; renders muted. */
  ended: boolean
}

export function planDateLabel(
  contact: {
    planStatus: string | null
    planStartedAt: Date | null
    planEndedAt: Date | null
  },
  now = Date.now()
): PlanDateLabel | null {
  const active = contact.planStatus !== null && ACTIVE.has(contact.planStatus)
  if (contact.planEndedAt && !active) {
    return { label: "Ended", date: contact.planEndedAt, ended: true }
  }
  if (contact.planStartedAt) {
    return {
      label: contact.planStartedAt.getTime() > now ? "Starts" : "Started",
      date: contact.planStartedAt,
      ended: false,
    }
  }
  return null
}
