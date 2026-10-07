import { PRIORITY_LABELS, STATUS_LABELS, type CasePriority, type CaseStatus } from "@/lib/crm/crm"
import { cn } from "@/lib/utils"

/**
 * Solid fills only — every pill's text is measured for contrast in the
 * e2e, light and dark, so nothing here leans on an alpha over a hover row.
 */
const PILL =
  "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight whitespace-nowrap"

const STATUS_TONE: Record<CaseStatus, string> = {
  new: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  waiting: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  closed: "bg-muted text-muted-foreground",
}

const PRIORITY_TONE: Record<CasePriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-200",
  high: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  urgent: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
}

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span data-testid="status-pill" data-status={status} className={cn(PILL, STATUS_TONE[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: CasePriority
  className?: string
}) {
  return (
    <span
      data-testid="priority-pill"
      data-priority={priority}
      className={cn(PILL, PRIORITY_TONE[priority], className)}
    >
      {PRIORITY_LABELS[priority]}
    </span>
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
    <span
      data-testid="plan-pill"
      title={planStatus ?? undefined}
      className={cn(
        PILL,
        inactive
          ? "bg-muted text-muted-foreground line-through"
          : "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200"
      )}
    >
      {plan}
    </span>
  )
}
