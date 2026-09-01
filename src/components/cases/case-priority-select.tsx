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
import type { CasePriority } from "@/lib/db/schema"

const PRIORITIES: { value: CasePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

export function CasePrioritySelect({
  caseId,
  priority,
}: {
  caseId: string
  priority: CasePriority
}) {
  const router = useRouter()
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleChange(next: CasePriority) {
    if (next === priority) return
    setIsBusy(true)
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
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
      <SelectTrigger size="sm" aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
