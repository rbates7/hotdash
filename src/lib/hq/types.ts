export type CardStatus = "backlog" | "to_do" | "building" | "review" | "done"
export type CardLabel = "bug" | "feature" | "chore" | "spike"

export interface Comment {
  id: string
  author: string
  body: string
  created_at: string // ISO string
}

export interface HQCard {
  id: string
  title: string
  owner: string
  status: CardStatus
  label?: CardLabel
  description?: string
  estimate_hours?: number
  chlk_key?: string
  comments: Comment[]
  updated_at: string // ISO string
}

export const STATUSES: CardStatus[] = ["backlog", "to_do", "building", "review", "done"]

export const STATUS_LABELS: Record<CardStatus, string> = {
  backlog: "Backlog",
  to_do: "To Do",
  building: "Building",
  review: "Review",
  done: "Done",
}

export const LABEL_OPTIONS: Array<{ value: CardLabel; label: string }> = [
  { value: "feature", label: "feature" },
  { value: "bug", label: "bug" },
  { value: "chore", label: "chore" },
  { value: "spike", label: "spike" },
]

export const CREW: readonly string[] = ["Fitz", "Simmons", "Mack", "Radcliffe", "May", "Mace"]
