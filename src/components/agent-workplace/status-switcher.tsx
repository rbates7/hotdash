"use client"

import { STATUS_CONFIG, STATUS_ORDER, type IssueStatus } from "@/lib/issues"
import { cn } from "@/lib/utils"
import {
  WORKPLACE_SWITCHER,
  WORKPLACE_SWITCHER_CHIP,
} from "@/components/agent-workplace/responsive"

export function StatusSwitcher({
  value,
  counts,
  onChange,
}: {
  value: IssueStatus
  counts: Record<IssueStatus, number>
  onChange: (status: IssueStatus) => void
}) {
  return (
    <div role="group" aria-label="Board status" className={WORKPLACE_SWITCHER}>
      {STATUS_ORDER.map((status) => {
        const on = value === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(status)}
            className={cn(
              WORKPLACE_SWITCHER_CHIP,
              on
                ? "border-foreground bg-foreground text-background"
                : "border-surface-border bg-surface text-foreground hover:bg-surface-hover"
            )}
          >
            <span>{STATUS_CONFIG[status].label}</span>
            <span
              className={cn(
                "text-caption font-semibold tabular-nums",
                on ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {counts[status]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
