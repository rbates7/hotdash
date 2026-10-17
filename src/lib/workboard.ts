/** Contract for Hill's GET /api/workboard (feat/workboard-data). */
export type WorkState = "working" | "needs_fix" | "ready_for_review" | "merged"
export type CiStatus = "passing" | "failing" | "pending" | "none"
export type ReviewStatus = "approved" | "changes_requested" | "pending" | "none"

export interface WorkItem {
  number: number
  title: string
  url: string
  owner: string
  branch: string
  state: WorkState
  ci: CiStatus
  review: ReviewStatus
  proofLinks: string[]
  updatedAt: string
  mergedAt: string | null
}

export interface Workboard {
  connected: boolean
  fetchedAt: string
  stale: boolean
  items: WorkItem[]
}

export const WORK_COLUMNS: readonly { state: WorkState; label: string }[] = [
  { state: "working", label: "Working" },
  { state: "needs_fix", label: "Needs fix" },
  { state: "ready_for_review", label: "Ready for review" },
  { state: "merged", label: "Merged" },
]

const OWNERS: Record<string, string> = {
  simmons: "Simmons",
  hill: "Hill",
  koenig: "Koenig",
  fitz: "Fitz",
  radcliffe: "Radcliffe",
}

/** 'simmons-bot' → 'Simmons'; unknown handles come back unchanged. */
export function ownerName(handle: string): string {
  const key = handle.toLowerCase().replace(/[-_]?bot$/, "")
  return OWNERS[key] ?? handle
}

export const NOT_CONNECTED: Workboard = { connected: false, fetchedAt: "", stale: false, items: [] }

/** Validate an unknown response; anything off-contract is treated as Not connected. */
export function parseWorkboard(raw: unknown): Workboard {
  if (!raw || typeof raw !== "object") return NOT_CONNECTED
  const r = raw as Partial<Workboard>
  if (r.connected !== true || !Array.isArray(r.items)) return { ...NOT_CONNECTED, fetchedAt: String(r.fetchedAt ?? "") }
  const states = new Set(WORK_COLUMNS.map((c) => c.state))
  return {
    connected: true,
    fetchedAt: String(r.fetchedAt ?? ""),
    stale: r.stale === true,
    items: r.items.filter((i): i is WorkItem => !!i && typeof i === "object" && states.has((i as WorkItem).state)),
  }
}

export function groupByState(items: WorkItem[]): Record<WorkState, WorkItem[]> {
  const out: Record<WorkState, WorkItem[]> = { working: [], needs_fix: [], ready_for_review: [], merged: [] }
  for (const item of items) out[item.state].push(item)
  return out
}
