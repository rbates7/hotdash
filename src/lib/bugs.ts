import { SEED_ISSUE_KEYS } from "@/lib/issues-seed-ids"
import type { InboxSourceStatus, InboxView, RealInboxItem } from "@/lib/inbox-sources"
import {
  STATUS_ORDER,
  issuesByStatus,
  type Issue,
  type IssueStatus,
} from "@/lib/issues"
import { dedupe } from "@/lib/persistence"

/**
 * Bugs has two real sources and no sample: Sentry's crash and error issues
 * (through `/api/inbox`, `sentryBugs`) and the founder's own Agent
 * Workplace tickets tagged `bug` (`userBugs`). The ticket half is a *view*
 * of the Workplace store, never a second list, so an edit on either screen
 * is the same edit. A ticket's source is the `crash` label or, failing
 * that, a coach's report.
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

/**
 * The founder's own bug tickets: tagged `bug` and not one of the old Agent
 * Workplace demo board's keys. The store already drops those from an old
 * saved copy; this keeps Bugs honest even if one slipped through. A ticket
 * the founder adds or tags on the board shows here.
 */
export function userBugs(issues: readonly Issue[]) {
  return bugs(issues).filter((i) => !SEED_ISSUE_KEYS.has(i.key))
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

export const CRASHES_LABEL = "Crashes"

export type SentryBugs = {
  /** `loading` until `/api/inbox` first answers; then Sentry's own status. */
  status: "loading" | InboxSourceStatus
  /** Sentry rows from `/api/inbox`, newest first. Empty unless connected or stale. */
  rows: RealInboxItem[]
}

/**
 * The crash list's rows: only `/api/inbox`'s Sentry rows (unresolved
 * error/fatal issues in `chlk/chlk-ios`), never a fixture. Pure, so the
 * screen and its tests agree on what each status shows.
 */
export function sentryBugs(view: InboxView): SentryBugs {
  if (view.phase === "loading") return { status: "loading", rows: [] }
  const status = view.inbox.sources.sentry.status
  const rows =
    status === "connected" || status === "stale" ? view.inbox.items.filter((i) => i.source === "sentry") : []
  return { status, rows }
}
