export type OpsStatus = "to_do" | "in_progress" | "blocked" | "done"

export const OPS_STATUSES: OpsStatus[] = ["to_do", "in_progress", "blocked", "done"]

export const OPS_STATUS_LABELS: Record<OpsStatus, string> = {
  to_do: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
}

export interface OpsComment {
  id: string
  author: string
  body: string
  created_at: string
}

export interface OpsCard {
  id: string
  title: string
  owner: string
  status: OpsStatus
  description?: string
  blocker_reason?: string
  comments: OpsComment[]
  updated_at: string
}
