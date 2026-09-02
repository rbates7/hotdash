"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { BADGE_TRIGGER_CLASSES } from "@/components/crm/case-status-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CasePriority } from "@/lib/crm/db/schema"
import { cn } from "@/lib/utils"

const PRIORITIES: { value: CasePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

const PRIORITY_TRIGGER: Record<CasePriority, string> = {
  low: "bg-muted text-muted-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
  normal: "bg-muted text-foreground hover:bg-muted/80 dark:bg-muted dark:hover:bg-muted/80",
  high: "bg-warning/15 text-warning hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25",
  urgent:
    "bg-destructive/15 text-destructive hover:bg-destructive/25 dark:bg-destructive/15 dark:hover:bg-destructive/25",
}

export function CasePrioritySelect({
  caseId,
  priority,
  variant = "default",
}: {
  caseId: string
  priority: CasePriority
  /** "badge" looks like the badge it replaces, for a list row. */
  variant?: "default" | "badge"
}) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleChange(next: CasePriority) {
    if (next === priority) return
    setIsBusy(true)
    try {
      const response = await fetch(`/api/crm/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: next }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed.")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update priority."
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Select
      items={PRIORITIES}
      value={priority}
      onValueChange={(value) => handleChange(value as CasePriority)}
      disabled={isBusy}
    >
      <SelectTrigger
        size="sm"
        aria-label="Priority"
        className={cn(
          variant === "badge" && BADGE_TRIGGER_CLASSES,
          variant === "badge" && PRIORITY_TRIGGER[priority]
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {PRIORITIES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
