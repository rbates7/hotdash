"use client"

import { CRM_PRIORITIES, CRM_PRIORITY_LABELS, type CrmCase, type CrmPriority } from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import { saveCaseEdit } from "@/hooks/use-crm-edits"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BADGE_TRIGGER_CLASSES } from "@/components/crm/case-status-select"
import { CRM_ROW_44 } from "@/components/crm/crm-touch"

const PRIORITY_TRIGGER: Record<CrmPriority, string> = {
  low: "bg-muted text-muted-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
  normal: "bg-muted text-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
  high: "bg-warning/15 text-warning-text hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25",
  urgent:
    "bg-destructive/15 text-danger-text hover:bg-destructive/25 dark:bg-destructive/15 dark:hover:bg-destructive/25",
}

const ITEMS = CRM_PRIORITIES.map((value) => ({ value, label: CRM_PRIORITY_LABELS[value] }))

/** Change a case's priority in place, kept in this browser like status. */
export function CasePrioritySelect({
  crmCase,
  live,
  variant = "badge",
}: {
  crmCase: CrmCase
  live: CrmCase
  variant?: "default" | "badge"
}) {
  return (
    <Select
      items={ITEMS}
      value={crmCase.priority}
      onValueChange={(value) => {
        if ((CRM_PRIORITIES as readonly unknown[]).includes(value)) {
          saveCaseEdit(live, { priority: value as CrmPriority })
        }
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Priority: ${crmCase.subject}`}
        data-priority={crmCase.priority}
        className={cn(
          "max-xl:h-11!",
          variant === "badge" && BADGE_TRIGGER_CLASSES,
          variant === "badge" && PRIORITY_TRIGGER[crmCase.priority]
        )}
      >
        <SelectValue>{CRM_PRIORITY_LABELS[crmCase.priority]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value} className={CRM_ROW_44}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
