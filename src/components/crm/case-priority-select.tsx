"use client"

import { CASE_PRIORITIES, PRIORITY_LABELS, type CasePriority } from "@/lib/crm/crm"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCrm } from "@/components/crm/crm-store"

export function CasePrioritySelect({
  caseId,
  priority,
}: {
  caseId: string
  priority: CasePriority
}) {
  const { setPriority } = useCrm()

  return (
    <Select
      value={priority}
      onValueChange={(value) => {
        if (value && (CASE_PRIORITIES as readonly string[]).includes(value)) {
          setPriority(caseId, value as CasePriority)
        }
      }}
      items={CASE_PRIORITIES.map((item) => ({ value: item, label: PRIORITY_LABELS[item] }))}
    >
      <SelectTrigger size="sm" aria-label="Priority">
        <SelectValue>{PRIORITY_LABELS[priority]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CASE_PRIORITIES.map((item) => (
          <SelectItem key={item} value={item}>
            {PRIORITY_LABELS[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
