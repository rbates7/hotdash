import type { Actor, Issue, IssueStatus, Sprint } from "@/lib/issues"
import {
  STATUS_CONFIG,
  STATUS_ORDER,
  activeSprint,
  daysUntil,
  issuesByStatus,
  issuesInSprint,
  sprintProgress,
  workingAgentIds,
} from "@/lib/issues"
import { pendingInboxItems } from "@/lib/inbox"
import type { InboxItem } from "@/lib/workplace-fixture"

/* ------------------------------------------------------------------ types */

export type KpiDirection = "up" | "down" | "flat"
export type KpiTone = "good" | "bad" | "flat"

export type Kpi = {
  id: string
  label: string
  /** Pre-formatted headline figure, e.g. "$26,190". */
  value: string
  /** Pre-formatted change over the comparison period, e.g. "+4.2%". */
  delta: string
  direction: KpiDirection
  /** Churn-style metrics: a drop is the healthy move, so it reads as good. */
  lowerIsBetter?: boolean
}

/** The single thing the founder has pinned for today, lifted from My Desk. */
export type NumberOne = {
  title: string
  note: string
}

export type NeedsYou = {
  /** At most `cap` rows, in Inbox order. */
  items: InboxItem[]
  /** Open rows still lit (unread), counted before the cap. */
  waiting: number
  /** Open rows that did not fit under the cap. */
  overflow: number
}

export type BoardColumn = {
  status: IssueStatus
  label: string
  count: number
}

export type BoardPreview = {
  sprint: Sprint
  columns: BoardColumn[]
  /** Agents with an issue actively running. */
  working: number
  progress: ReturnType<typeof sprintProgress>
  daysLeft: number
}

/* ---------------------------------------------------------------- helpers */

/**
 * Whether a KPI's move is the healthy one. Up is good unless the metric is
 * one you want shrinking, in which case down is.
 */
export function kpiTone(kpi: Pick<Kpi, "direction" | "lowerIsBetter">): KpiTone {
  if (kpi.direction === "flat") return "flat"
  const healthy: KpiDirection = kpi.lowerIsBetter ? "down" : "up"
  return kpi.direction === healthy ? "good" : "bad"
}

/**
 * The page lede, e.g. "Wednesday pulse". The founder is in Central time, so
 * the weekday is read there rather than wherever the server happens to run.
 */
export function pulseLabel(date: Date, timeZone = "America/Chicago") {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", timeZone })
  return `${weekday} pulse`
}

export const NEEDS_YOU_CAP = 5

/**
 * The Inbox rows that still need the founder: the shared pending selector
 * (open ticket, not dismissed), capped so the strip stays a glance. The
 * Inbox tab keeps the full list through the same selector.
 */
export function needsYou(
  inbox: InboxItem[],
  issues: Issue[],
  cap = NEEDS_YOU_CAP
): NeedsYou {
  const open = pendingInboxItems(inbox, issues)
  return {
    items: open.slice(0, cap),
    waiting: open.filter((i) => i.unread).length,
    overflow: Math.max(0, open.length - cap),
  }
}

/**
 * A glance at the running sprint: how many cards sit in each column, how
 * many agents are busy, and how far along it is. Null when nothing is
 * running, which the door renders as its empty state.
 */
export function boardPreview(
  issues: Issue[],
  sprints: Sprint[],
  actors: Actor[],
  now: Date
): BoardPreview | null {
  const sprint = activeSprint(sprints)
  if (!sprint) return null
  const inSprint = issuesInSprint(issues, sprint.id)
  return {
    sprint,
    columns: STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_CONFIG[status].label,
      count: issuesByStatus(inSprint, status).length,
    })),
    working: workingAgentIds(inSprint, actors).length,
    progress: sprintProgress(inSprint),
    daysLeft: daysUntil(sprint.endDate, now),
  }
}

/**
 * Polyline points for a small trend chart. The first value sits at the left
 * edge and the last at the right; the vertical range is the series' own
 * min..max with a little headroom so a flat line is not glued to an edge.
 */
export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
  pad = 2
) {
  if (values.length === 0) return ""
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  return values
    .map((v, i) => {
      const x = pad + i * stepX
      const y =
        span === 0
          ? height / 2
          : pad + (1 - (v - min) / span) * (height - pad * 2)
      return `${round(x)},${round(y)}`
    })
    .join(" ")
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/** "$21.8k" style label for a sparkline endpoint. */
export function compactDollars(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return `$${n}`
}
