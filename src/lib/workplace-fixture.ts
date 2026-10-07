/**
 * Dummy rows for the Autopilots and Inbox tabs, after
 * founder-dashboard-workplace-v0.html. Both tabs are still "open" in the
 * requirements doc, so this is deliberately flat display data — no model,
 * no store — until the product is locked.
 *
 * Nothing here carries an absolute date. Inbox rows are built relative to
 * the instant the page was requested (`buildInbox(now)`), and an autopilot's
 * next run is computed from its schedule (`nextRunLabel` in
 * `@/lib/autopilots`), so neither can go stale.
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

/** The mock's four rows — 18 minutes, 2 hours, 4 hours and a day old. */
export function buildInbox(now: Date): InboxItem[] {
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  return [
    {
      id: "408-review",
      title: "Agent finished — needs review",
      snippet: "Preview thumbnail on iPad is ready",
      at: minutesAgo(18),
      unread: true,
      issueKey: "CHLK-408",
    },
    {
      id: "412-blocked",
      title: "Agent blocked",
      snippet: "Refund path for annual seats · waiting on Stripe dashboard access",
      at: minutesAgo(2 * 60),
      unread: true,
      issueKey: "CHLK-412",
    },
    {
      id: "406-urgent",
      title: "Agent flagged something urgent",
      snippet: "Failed-card webhook needs a look before morning",
      at: minutesAgo(4 * 60),
      unread: false,
      issueKey: "CHLK-406",
    },
    {
      id: "standup-digest",
      title: "Daily standup summary",
      snippet: "Dismissed · yesterday's digest",
      at: minutesAgo(26 * 60),
      unread: false,
      dismissed: true,
    },
  ]
}
