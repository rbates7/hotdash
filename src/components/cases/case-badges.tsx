import { Badge } from "@/components/ui/badge"
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/cases/server"
import type { CasePriority, CaseStatus } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

const STATUS_CLASSES: Record<CaseStatus, string> = {
  new: "bg-chart-1/15 text-chart-1",
  open: "bg-chart-2/15 text-chart-2",
  waiting: "bg-chart-4/15 text-chart-4",
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
  normal: "bg-chart-3/15 text-chart-3",
  high: "bg-chart-4/15 text-chart-4",
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
        inactive ? "bg-muted text-muted-foreground line-through" : "bg-chart-5/15 text-chart-5"
      )}
      title={planStatus ?? undefined}
    >
      {plan}
    </Badge>
  )
}
