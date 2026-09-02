import { planDateLabel } from "@/lib/crm/contacts/plan-dates"
import { formatDate } from "@/lib/crm/format"

/** "Started Jun 3" for someone paying, "Ended Aug 30" muted for someone
 * who left, "Starts Sep 9" for a trial; a dash when Stripe has no dates. */
export function PlanDates({
  contact,
  className,
}: {
  contact: {
    planStatus: string | null
    planStartedAt: Date | null
    planEndedAt: Date | null
  }
  className?: string
}) {
  const info = planDateLabel(contact)
  if (!info) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={info.ended ? "text-muted-foreground" : className}
      title={info.date.toLocaleString()}
    >
      {info.label} {formatDate(info.date)}
    </span>
  )
}
