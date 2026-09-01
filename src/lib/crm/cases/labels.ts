import type { CasePriority, CaseStatus } from "@/lib/crm/db/schema"

export const STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  open: "Open",
  waiting: "Waiting on customer",
  closed: "Closed",
}

export const PRIORITY_LABELS: Record<CasePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}
