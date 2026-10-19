/**
 * Dummy rows for the Autopilots tab, after founder-dashboard-workplace-v0.html,
 * and the shape of an Inbox row. The Inbox itself is live (`/api/inbox`,
 * see `@/lib/inbox-sources`); its old sample rows now live only in
 * `@/test/inbox-fixture` for unit tests.
 *
 * Nothing here carries an absolute date: an autopilot's next run is
 * computed from its schedule (`nextRunLabel` in `@/lib/autopilots`).
 */

export type AutopilotSchedule =
  | { kind: "daily"; hour: number; minute?: number }
  | { kind: "weekly"; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; hour: number; minute?: number }
  | { kind: "every-hours"; hours: number }

export type Autopilot = {
  id: string
  name: string
  note: string
  /** Human label for the schedule column, e.g. "Daily · 8:00am CT". */
  scheduleLabel: string
  schedule: AutopilotSchedule
  lastRun: "ok" | "failed" | "idle"
}

export const autopilots: Autopilot[] = [
  {
    id: "standup",
    name: "Daily standup summary",
    note: "Assumed · run-only digest",
    scheduleLabel: "Daily · 8:00am CT",
    schedule: { kind: "daily", hour: 8 },
    lastRun: "ok",
  },
  {
    id: "bug-audit",
    name: "Weekly bug audit",
    note: "Assumed · Bugs page sweep",
    scheduleLabel: "Mondays · 9:00am CT",
    schedule: { kind: "weekly", weekday: 1, hour: 9 },
    lastRun: "ok",
  },
  {
    id: "status-report",
    name: "System Status health report",
    note: "Assumed · posts to Inbox if degraded",
    scheduleLabel: "Every 6 hours",
    schedule: { kind: "every-hours", hours: 6 },
    lastRun: "ok",
  },
]

export type InboxItem = {
  id: string
  title: string
  snippet: string
  /** ISO instant the row arrived. Shown as an age via `formatAge`. */
  at: string
  /** Lit dot = needs the founder; off = informational. */
  unread: boolean
  dismissed?: boolean
  /** Opens the ticket when set. */
  issueKey?: string
}
