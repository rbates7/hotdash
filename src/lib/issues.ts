import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleSlashIcon,
  CircleIcon,
  MinusIcon,
  ChevronUpIcon,
  ChevronsUpIcon,
  ChevronDownIcon,
  type LucideIcon,
} from "lucide-react"

/* ------------------------------------------------------------------ types */

export type IssueStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"

export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none"

export type SprintStatus = "planned" | "active" | "completed"

export type ActorKind = "agent" | "human"

export type Actor = {
  id: string
  name: string
  kind: ActorKind
  /** Humans render initials; agents render a bot glyph instead. */
  initials: string
  presence: "idle" | "working"
}

export type ActivityEntry = {
  id: string
  actorId: string
  /** Rendered after the actor's name, e.g. "created this issue". */
  verb: string
  at: string
}

export type Comment = {
  id: string
  actorId: string
  body: string
  at: string
}

export type Sprint = {
  id: string
  name: string
  goal?: string
  startDate: string
  endDate: string
  status: SprintStatus
}

export type Issue = {
  key: string
  title: string
  description?: string
  status: IssueStatus
  priority: IssuePriority
  /** null = unassigned, which is what the "New" filter selects. */
  assigneeId: string | null
  /** null = not in any sprint, i.e. it lives in the backlog. */
  sprintId: string | null
  labels: string[]
  project?: string
  createdById: string
  createdAt: string
  updatedAt: string
  /** True while an agent is actively running this issue. */
  isAgentWorking: boolean
  blockerReason?: string
  activity: ActivityEntry[]
  comments: Comment[]
}

/* ----------------------------------------------------------- status config */

export const STATUS_ORDER: IssueStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
]

/**
 * Column presentation. The tinted backgrounds are Multica's: neutral for the
 * not-started column, and a wash of the semantic colour for the rest so the
 * board reads at a glance without labels.
 */
export const STATUS_CONFIG: Record<
  IssueStatus,
  { label: string; icon: LucideIcon; iconColor: string; columnBg: string }
> = {
  todo: {
    label: "To Do",
    icon: CircleIcon,
    iconColor: "text-muted-foreground",
    columnBg: "bg-muted/40",
  },
  in_progress: {
    label: "In Progress",
    icon: CircleDotIcon,
    iconColor: "text-warning",
    columnBg: "bg-warning/5",
  },
  in_review: {
    label: "In Review",
    icon: CircleDashedIcon,
    iconColor: "text-success",
    columnBg: "bg-success/5",
  },
  done: {
    label: "Done",
    icon: CircleCheckIcon,
    iconColor: "text-info",
    columnBg: "bg-info/5",
  },
  blocked: {
    label: "Blocked",
    icon: CircleSlashIcon,
    iconColor: "text-destructive",
    columnBg: "bg-destructive/5",
  },
}

export const PRIORITY_CONFIG: Record<
  IssuePriority,
  { label: string; icon: LucideIcon; color: string }
> = {
  urgent: { label: "Urgent", icon: ChevronsUpIcon, color: "text-destructive" },
  high: { label: "High", icon: ChevronUpIcon, color: "text-warning" },
  medium: { label: "Medium", icon: MinusIcon, color: "text-muted-foreground" },
  low: { label: "Low", icon: ChevronDownIcon, color: "text-muted-foreground" },
  none: { label: "No priority", icon: MinusIcon, color: "text-faint-foreground" },
}

/* ------------------------------------------------------------- board filter */

export type BoardFilter = "all" | "members" | "agents" | "new"

export const BOARD_FILTERS: Array<{ value: BoardFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "members", label: "Members" },
  { value: "agents", label: "Agents" },
  { value: "new", label: "New" },
]

/* --------------------------------------------------------------- selectors */

export function actorById(actors: Actor[], id: string | null) {
  return id ? (actors.find((a) => a.id === id) ?? null) : null
}

export function activeSprint(sprints: Sprint[]) {
  return sprints.find((s) => s.status === "active") ?? null
}

export function plannedSprints(sprints: Sprint[]) {
  return sprints.filter((s) => s.status === "planned")
}

export function issuesInSprint(issues: Issue[], sprintId: string | null) {
  return sprintId ? issues.filter((i) => i.sprintId === sprintId) : []
}

/** Issues in no sprint at all — the backlog proper. */
export function backlogIssues(issues: Issue[]) {
  return issues.filter((i) => i.sprintId === null)
}

export function matchesFilter(
  issue: Issue,
  filter: BoardFilter,
  actors: Actor[]
) {
  if (filter === "all") return true
  if (filter === "new") return issue.assigneeId === null
  const assignee = actorById(actors, issue.assigneeId)
  if (!assignee) return false
  return filter === "agents"
    ? assignee.kind === "agent"
    : assignee.kind === "human"
}

export function issuesByStatus(issues: Issue[], status: IssueStatus) {
  return issues
    .filter((i) => i.status === status)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

/** Agents with at least one issue actively running. */
export function workingAgentIds(issues: Issue[], actors: Actor[]) {
  const ids = new Set<string>()
  for (const issue of issues) {
    if (!issue.isAgentWorking || !issue.assigneeId) continue
    if (actorById(actors, issue.assigneeId)?.kind === "agent") {
      ids.add(issue.assigneeId)
    }
  }
  return [...ids]
}

export function sprintProgress(issues: Issue[]) {
  const total = issues.length
  const done = issues.filter((i) => i.status === "done").length
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Whole days from now until `date`; negative once it has passed. */
export function daysUntil(date: string, now: Date) {
  const ms = Date.parse(date) - now.getTime()
  return Math.ceil(ms / 86_400_000)
}

export function formatRelative(at: string, now: Date) {
  const mins = Math.round((now.getTime() - Date.parse(at)) / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatDay(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}
