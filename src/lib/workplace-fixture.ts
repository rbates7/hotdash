/**
 * Dummy rows for the Autopilots and Inbox tabs, copied from
 * founder-dashboard-workplace-v0.html. Both tabs are still "open" in the
 * requirements doc, so this is deliberately flat display data — no model,
 * no store — until the product is locked.
 */

export type Autopilot = {
  id: string
  name: string
  note: string
  schedule: string
  nextRun: string
  lastRun: "ok" | "failed" | "idle"
}

export const autopilots: Autopilot[] = [
  {
    id: "standup",
    name: "Daily standup summary",
    note: "Assumed · run-only digest",
    schedule: "Daily · 8:00am CT",
    nextRun: "Today · 8:00am CT",
    lastRun: "ok",
  },
  {
    id: "bug-audit",
    name: "Weekly bug audit",
    note: "Assumed · Bugs page sweep",
    schedule: "Mondays · 9:00am CT",
    nextRun: "Mon 31 Aug · 9:00am CT",
    lastRun: "ok",
  },
  {
    id: "status-report",
    name: "System Status health report",
    note: "Assumed · posts to Inbox if degraded",
    schedule: "Every 6 hours",
    nextRun: "Today · 6:00am CT",
    lastRun: "ok",
  },
]

export type InboxItem = {
  id: string
  title: string
  snippet: string
  /** Pre-formatted relative time, e.g. "18m". */
  when: string
  /** Lit dot = needs the founder; off = informational. */
  unread: boolean
  dismissed?: boolean
  /** Opens the ticket when set. */
  issueKey?: string
}

export const inbox: InboxItem[] = [
  {
    id: "408-review",
    title: "Agent finished — needs review",
    snippet: "Preview thumbnail on iPad is ready",
    when: "18m",
    unread: true,
    issueKey: "CHLK-408",
  },
  {
    id: "412-blocked",
    title: "Agent blocked",
    snippet: "Refund path for annual seats · waiting on Stripe dashboard access",
    when: "2h",
    unread: true,
    issueKey: "CHLK-412",
  },
  {
    id: "406-urgent",
    title: "Agent flagged something urgent",
    snippet: "Failed-card webhook needs a look before morning",
    when: "4h",
    unread: false,
    issueKey: "CHLK-406",
  },
  {
    id: "standup-aug-25",
    title: "Daily standup summary",
    snippet: "Dismissed · digest for Tue 25 Aug",
    when: "Yesterday",
    unread: false,
    dismissed: true,
  },
]
