import {
  INITIATIVE_STATUS_LABEL,
  INITIATIVE_TYPE_LABEL,
  type InitiativeStatus,
  type InitiativeType,
} from "@/lib/community-development"
import { cn } from "@/lib/utils"

const PILL =
  "text-caption inline-flex h-[22px] items-center rounded-full px-2 font-semibold tracking-tight whitespace-nowrap"

/**
 * Solid fills only — every pill's text is measured for contrast in the
 * e2e, light and dark, so nothing here leans on an alpha over a hover row.
 */
const STATUS_TONE: Record<InitiativeStatus, string> = {
  idea: "bg-muted text-foreground border border-dashed border-faint-foreground",
  planned: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  done: "bg-muted text-foreground",
}

export function StatusPill({
  status,
  className,
}: {
  status: InitiativeStatus
  className?: string
}) {
  return (
    <span
      data-testid="status-pill"
      data-status={status}
      className={cn(PILL, STATUS_TONE[status], className)}
    >
      {INITIATIVE_STATUS_LABEL[status]}
    </span>
  )
}

export function TypePill({ type, className }: { type: InitiativeType; className?: string }) {
  return (
    <span
      data-testid="type-pill"
      className={cn(PILL, "border bg-muted text-foreground border-border", className)}
    >
      {INITIATIVE_TYPE_LABEL[type]}
    </span>
  )
}
