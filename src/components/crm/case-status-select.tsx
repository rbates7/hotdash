"use client"

import {
  CRM_CASE_STATUSES,
  CRM_STATUS_LABELS,
  type CrmCase,
  type CrmCaseStatus,
} from "@/lib/crm/types.ours"
import { cn } from "@/lib/utils"
import { saveCaseEdit } from "@/hooks/use-crm-edits"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CRM_ROW_44 } from "@/components/crm/crm-touch"

/**
 * crm-port's badge look, for a picker sitting in a list row. Light and dark
 * are both named so they replace the trigger's own backgrounds. Below 1280
 * the trigger is a 44px target.
 */
export const BADGE_TRIGGER_CLASSES =
  "gap-1 rounded-full border-transparent px-2 py-0 text-xs font-medium data-[size=sm]:h-6 data-[size=sm]:rounded-full [&_svg]:size-3 [&_svg]:text-current [&_svg]:opacity-60 max-xl:h-11! max-xl:min-w-11 max-xl:px-3"

const STATUS_TRIGGER: Record<CrmCaseStatus, string> = {
  open: "bg-success/15 text-success-text hover:bg-success/25 dark:bg-success/15 dark:hover:bg-success/25",
  waiting_on_us: "bg-info/15 text-foreground hover:bg-info/25 dark:bg-info/20 dark:hover:bg-info/30",
  waiting_on_them:
    "bg-warning/15 text-warning-text hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25",
  closed: "bg-muted text-muted-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
}

const ITEMS = CRM_CASE_STATUSES.map((value) => ({ value, label: CRM_STATUS_LABELS[value] }))

/**
 * Change a case's status in place. Gmail is read-only, so the change is
 * kept in this browser (`@/lib/crm/local-edits`) over the live row.
 */
export function CaseStatusSelect({
  crmCase,
  live,
  variant = "badge",
}: {
  /** The case as shown (edits applied). */
  crmCase: CrmCase
  /** The case as the server sent it: what the edit records it replaced. */
  live: CrmCase
  variant?: "default" | "badge"
}) {
  return (
    <Select
      items={ITEMS}
      value={crmCase.status}
      onValueChange={(value) => {
        if ((CRM_CASE_STATUSES as readonly unknown[]).includes(value)) {
          saveCaseEdit(live, { status: value as CrmCaseStatus })
        }
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status: ${crmCase.subject}`}
        data-status={crmCase.status}
        className={cn(
          "max-xl:h-11!",
          variant === "badge" && BADGE_TRIGGER_CLASSES,
          variant === "badge" && STATUS_TRIGGER[crmCase.status]
        )}
      >
        <SelectValue>{CRM_STATUS_LABELS[crmCase.status]}</SelectValue>
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
