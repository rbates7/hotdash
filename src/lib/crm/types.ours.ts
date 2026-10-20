/**
 * The CRM screens' own data contract (Hill's final names). `/api/crm/gmail`
 * will answer in this shape once his typed PR lands; until then
 * `adapter.ts` maps today's `GmailSummary` onto it, so the screens only
 * ever see these types.
 */

export const CRM_CASE_STATUSES = ["open", "waiting_on_us", "waiting_on_them", "closed"] as const
export type CrmCaseStatus = (typeof CRM_CASE_STATUSES)[number]

export const CRM_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type CrmPriority = (typeof CRM_PRIORITIES)[number]

export const CRM_STATUS_LABELS: Record<CrmCaseStatus, string> = {
  open: "Open",
  waiting_on_us: "Waiting on you",
  waiting_on_them: "Waiting on them",
  closed: "Closed",
}

export const CRM_PRIORITY_LABELS: Record<CrmPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}

export type CrmPerson = { name: string | null; email: string }

export type CrmCase = {
  id: string
  threadId: string
  subject: string
  accountId: string | null
  contact: CrmPerson
  status: CrmCaseStatus
  priority: CrmPriority
  /** When the ball came to us (their message is the newest), or null. */
  waitingOnUsSince: string | null
  lastMessageAt: string
  lastMessageSnippet: string
  messageCount: number
  unread: boolean
  labels: string[]
}

export type CrmAttachment = { name: string; mimeType: string; size: number }

export type CrmMessage = {
  id: string
  direction: "inbound" | "outbound"
  from: CrmPerson
  to: string[]
  cc: string[]
  sentAt: string
  /** Raw from Gmail: render only through `sanitizeHtml`. */
  bodyHtml: string | null
  bodyText: string | null
  attachments: CrmAttachment[]
}

export type CrmAccount = {
  id: string
  name: string
  domain: string | null
  contacts: CrmPerson[]
  openCases: number
  waitingOnUsCount: number
  lastActivityAt: string | null
}

export type CrmActivityKind = "received" | "sent" | "status_changed"

export type CrmActivity = {
  id: string
  /** `status_changed` is optional on the wire and may never appear. */
  kind: CrmActivityKind
  caseId: string
  at: string
  summary: string
}

export type CrmCounts = {
  open: number
  waitingOnUs: number
  waitingOnThem: number
  closedThisWeek: number
}

export type CrmSummaryStatus = "connected" | "stale" | "connecting" | "not_connected"

/** Lists are empty and `counts` null unless connected or stale. */
export type CrmSummary = {
  status: CrmSummaryStatus
  lastUpdated: string | null
  cases: CrmCase[]
  accounts: CrmAccount[]
  recentActivity: CrmActivity[]
  counts: CrmCounts | null
}

/** One read of `/api/crm/gmail`. 401 is the login gate, never "Not connected". */
export type CrmFetchResult<T> = { kind: "ok"; data: T } | { kind: "unauthorized" } | { kind: "error" }

export function emptyCrmSummary(status: "connecting" | "not_connected"): CrmSummary {
  return { status, lastUpdated: null, cases: [], accounts: [], recentActivity: [], counts: null }
}

export const CRM_NOT_CONNECTED: CrmSummary = emptyCrmSummary("not_connected")
export const CRM_CONNECTING: CrmSummary = emptyCrmSummary("connecting")

/**
 * Whether the ball is with us: Hill's explicit status, or an open case
 * whose newest message is theirs. One predicate for the count, the
 * Overview list and the Cases toggle so they always agree.
 */
export function isWaitingOnUs(c: Pick<CrmCase, "status" | "waitingOnUsSince">) {
  return c.status === "waiting_on_us" || (c.status === "open" && c.waitingOnUsSince !== null)
}

export function isOpenCrmCase(c: Pick<CrmCase, "status">) {
  return c.status !== "closed"
}
