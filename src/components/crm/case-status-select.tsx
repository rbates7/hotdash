"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STATUS_LABELS } from "@/lib/crm/cases/labels"
import { CASE_STATUSES, type CaseStatus } from "@/lib/crm/db/schema"
import { cn } from "@/lib/utils"

const STATUSES = CASE_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}))

/** The badge look, for a picker sitting in a list row. Light and dark are
 * both named so they replace the trigger's own backgrounds. */
export const BADGE_TRIGGER_CLASSES =
  "gap-1 rounded-full border-transparent px-2 py-0 text-xs font-medium data-[size=sm]:h-6 data-[size=sm]:rounded-full [&_svg]:size-3 [&_svg]:text-current [&_svg]:opacity-60"

const STATUS_TRIGGER: Record<CaseStatus, string> = {
  new: "bg-info/15 text-info hover:bg-info/25 dark:bg-info/15 dark:hover:bg-info/25",
  open: "bg-success/15 text-success hover:bg-success/25 dark:bg-success/15 dark:hover:bg-success/25",
  waiting:
    "bg-warning/15 text-warning hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25",
  closed:
    "bg-muted text-muted-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
}

/**
 * Change a case's status in place. Closing this way leaves the same note
 * and closed-at as the status path on the case page; reopening clears it.
 */
export function CaseStatusSelect({
  caseId,
  status,
  variant = "default",
}: {
  caseId: string
  status: CaseStatus
  /** "badge" looks like the badge it replaces, for a list row. */
  variant?: "default" | "badge"
}) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleChange(next: CaseStatus) {
    if (next === status) return
    setIsBusy(true)
    try {
      const response = await fetch(`/api/crm/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed.")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update status."
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Select
      items={STATUSES}
      value={status}
      onValueChange={(value) => handleChange(value as CaseStatus)}
      disabled={isBusy}
    >
      <SelectTrigger
        size="sm"
        aria-label="Status"
        className={cn(
          variant === "badge" && BADGE_TRIGGER_CLASSES,
          variant === "badge" && STATUS_TRIGGER[status]
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {STATUSES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
