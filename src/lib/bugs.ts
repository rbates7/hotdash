import { daysEnding, inPeriod, toDay, type IsoDay, type Period } from "@/lib/clock"
import { SEED_ISSUE_KEYS } from "@/lib/issues-fixture"
import type { Kpi } from "@/lib/home"
import { VS_PREVIOUS_WEEK, weekEnding } from "@/lib/kpis"
import { trendFor } from "@/lib/metrics"
import {
  STATUS_ORDER,
  issuesByStatus,
  type Issue,
  type IssueStatus,
} from "@/lib/issues"
import { dedupe } from "@/lib/persistence"

/**
 * Bugs is a *view* of Agent Workplace tickets, never a second list. A ticket
 * is a bug when it carries the `bug` label; its source is the `crash` label
 * (crash tooling) or, failing that, a coach's report. Everything here is a
 * pure selector over the Workplace store's issues, so an edit on either
 * screen is the same edit.
 */

export const BUG_LABEL = "bug"
export const CRASH_LABEL = "crash"
export const COACH_REPORTED_LABEL = "coach-reported"

export type BugSource = "coach" | "crash"

export const BUG_SOURCE_CONFIG: Record<BugSource, { label: string }> = {
  coach: { label: "Coach-reported" },
  crash: { label: "Crash" },
}

export function isBug(issue: Pick<Issue, "labels">) {
  return issue.labels.includes(BUG_LABEL)
}

export function bugSource(issue: Pick<Issue, "labels">): BugSource {
  return issue.labels.includes(CRASH_LABEL) ? "crash" : "coach"
}

/** Add `label` when missing, remove it when present; never a duplicate. */
export function toggleLabel(labels: readonly string[], label: string): string[] {
  const current = dedupe(labels)
  return current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
}

export function bugs(issues: readonly Issue[]) {
  return issues.filter(isBug)
}

/** True while any listed bug is a seed ticket — the sample-data notice's gate. */
export function hasSeedBugs(issues: readonly Issue[]) {
  return bugs(issues).some((i) => SEED_ISSUE_KEYS.has(i.key))
}

/** Everything not yet Done — what "No open bugs" is the absence of. */
export function openBugs(issues: readonly Issue[]) {
  return bugs(issues).filter((i) => i.status !== "done")
}

/**
 * The board's column order with Done moved last, so the list reads
 * open work first and fixed bugs as the tail.
 */
export const BUG_STATUS_ORDER: IssueStatus[] = [
  ...STATUS_ORDER.filter((s) => s !== "done"),
  "done",
]

export type BugGroup = { status: IssueStatus; bugs: Issue[] }

/** Bugs grouped by status in `BUG_STATUS_ORDER`; empty groups are dropped. */
export function groupBugs(issues: readonly Issue[]): BugGroup[] {
  const all = bugs(issues)
  return BUG_STATUS_ORDER.map((status) => ({ status, bugs: issuesByStatus(all, status) })).filter(
    (g) => g.bugs.length > 0
  )
}

/**
 * Status text uses the text-safe tokens (≥ 4.5:1 on the card surface in
 * both themes); the board's icon tints stay on the icons.
 */
export const STATUS_TEXT: Record<IssueStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-warning-text",
  in_review: "text-success-text",
  done: "text-muted-foreground",
  blocked: "text-danger-text",
}

/* ------------------------------------------------------------- crashes */

/**
 * Sample crash counts. Sentry is not wired up, so this is an invented
 * two-week spread of crashes per day, newest last, laid over the real
 * calendar: index 13 is today. The card sums the trailing seven days and
 * the seven before, the same windows Home's "Cash this week" uses.
 */
const DAILY_CRASHES = [2, 1, 3, 2, 4, 1, 2, 1, 0, 2, 1, 1, 2, 1] as const

export type CrashCount = {
  /** Crashes on the seven calendar days ending today, inclusive. */
  value: number
  /** Crashes on the seven days before those. */
  previous: number
  thisWeek: Period
  lastWeek: Period
}

export function dailyCrashes(today: IsoDay | Date): { date: IsoDay; count: number }[] {
  const days = daysEnding(toDay(today), DAILY_CRASHES.length)
  return days.map((date, i) => ({ date, count: DAILY_CRASHES[i] }))
}

export function crashCount(today: IsoDay | Date): CrashCount {
  const { thisWeek, lastWeek } = weekEnding(today)
  const rows = dailyCrashes(today)
  const sum = (p: Period) => rows.filter((r) => inPeriod(r.date, p)).reduce((n, r) => n + r.count, 0)
  return { value: sum(thisWeek), previous: sum(lastWeek), thisWeek, lastWeek }
}

export const CRASHES_LABEL = "Crashes"

/** The crash card as a KPI, in Home's shape so the shared delta pill renders it. */
export function crashKpi(today: IsoDay | Date): Kpi {
  const { value, previous } = crashCount(today)
  const t = trendFor(value, previous, "abs", { lowerIsBetter: true })
  return {
    id: "crashes",
    label: CRASHES_LABEL,
    value: String(value),
    delta: `${t.text} ${VS_PREVIOUS_WEEK}`,
    direction: t.flat ? "flat" : t.up ? "up" : "down",
    lowerIsBetter: true,
  }
}
