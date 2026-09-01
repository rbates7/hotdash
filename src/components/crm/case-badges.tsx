import { Badge } from "@/components/ui/badge"
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/crm/cases/labels"
import type { CasePriority, CaseStatus } from "@/lib/crm/db/schema"
import { cn } from "@/lib/utils"

const STATUS_CLASSES: Record<CaseStatus, string> = {
  new: "bg-info/15 text-info",
  open: "bg-success/15 text-success",
  waiting: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent", STATUS_CLASSES[status])}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}

const PRIORITY_CLASSES: Record<CasePriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-muted text-foreground",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent", PRIORITY_CLASSES[priority])}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}

export function PlanBadge({
  plan,
  planStatus,
}: {
  plan: string | null
  planStatus: string | null
}) {
  if (!plan) return null
  const inactive = planStatus && planStatus !== "active" && planStatus !== "trialing"
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent",
        inactive ? "bg-muted text-muted-foreground line-through" : "bg-info/15 text-info"
      )}
      title={planStatus ?? undefined}
    >
      {plan}
    </Badge>
  )
}
