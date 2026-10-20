"use client"

import {
  CRM_CASE_STATUSES,
  CRM_STATUS_LABELS,
  type CrmCase,
  type CrmCaseStatus,
} from "@/lib/crm/case-view"
import { cn } from "@/lib/utils"
import { saveCaseEdit } from "@/hooks/use-crm-edits"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_TONE } from "@/components/crm/crm-badges"
import { CRM_ROW_44 } from "@/components/crm/crm-touch"

/**
 * Deke's badge (radius 6, 2×8, medium 11.5) as a picker trigger in a list
 * row, with its chevron in the text colour. Light and dark tints are both
 * named so they replace the trigger's own backgrounds. Below 1280 the
 * trigger is a 44px target.
 */
export const BADGE_TRIGGER_CLASSES =
  "gap-1 rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium data-[size=sm]:h-6 data-[size=sm]:rounded-[6px] [&_svg]:size-3 [&_svg]:text-current hover:brightness-95 dark:hover:brightness-110 max-xl:h-11! max-xl:min-w-11 max-xl:px-3"

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
          variant === "badge" && "border-transparent",
          variant === "badge" && STATUS_TONE[crmCase.status]
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
