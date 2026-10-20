"use client"

import { CRM_PRIORITIES, CRM_PRIORITY_LABELS, type CrmCase, type CrmPriority } from "@/lib/crm/case-view"
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
import { PRIORITY_TONE } from "@/components/crm/crm-badges"
import { CRM_ROW_44 } from "@/components/crm/crm-touch"

/** Urgent / High are tinted; Normal / Low are outline badges (spec §1). */
const PRIORITY_TRIGGER: Record<CrmPriority, string> = {
  urgent: cn("border-transparent", PRIORITY_TONE.urgent),
  high: cn("border-transparent", PRIORITY_TONE.high),
  normal: cn(PRIORITY_TONE.normal, "dark:bg-transparent"),
  low: cn(PRIORITY_TONE.low, "dark:bg-transparent"),
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
