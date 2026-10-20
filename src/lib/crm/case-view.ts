import type {
  CrmActivity,
  CrmCase,
  CrmCasePriority,
  CrmCaseStatus,
  CrmCounts,
  CrmListResponse,
} from "@/lib/crm/types"

/**
 * The CRM screens' side of Hill's contract (`types.ts`, which stays his):
 * the value lists, labels and predicates the UI needs, plus the store's
 * result type. `open` and `low` never come from Gmail but stay valid
 * values for this browser's own edits.
 */

export type {
  CrmAccount,
  CrmActivity,
  CrmCase,
  CrmCaseStatus,
  CrmCounts,
  CrmMessage,
  CrmPerson,
} from "@/lib/crm/types"

export const CRM_CASE_STATUSES =["open", "waiting_on_us", "waiting_on_them", "closed"] as const satisfies readonly CrmCaseStatus[]

export const CRM_PRIORITIES = ["low", "normal", "high", "urgent"] as const satisfies readonly CrmCasePriority[]

export type CrmPriority = CrmCasePriority

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

/** One read of `GET /api/crm/gmail`, as the screens hold it. */
export type CrmSummary = CrmListResponse

/**
 * One read of `/api/crm/gmail`. 401 is the login gate, never "Not
 * connected"; `not_found` is the thread route's 400 (bad id) or 404.
 */
export type CrmFetchResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "error" }

export const ZERO_COUNTS: CrmCounts = { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 }

/** As the route answers when Gmail is not live: the counts are zeros and mean nothing. */
export function emptyCrmSummary(status: "connecting" | "not_connected"): CrmSummary {
  return { status, lastUpdated: null, counts: ZERO_COUNTS, cases: [], accounts: [], recentActivity: [] }
}

export const CRM_NOT_CONNECTED: CrmSummary = emptyCrmSummary("not_connected")
export const CRM_CONNECTING: CrmSummary = emptyCrmSummary("connecting")

/** The ball is with us. The same predicate as Hill's `counts.waitingOnUs`. */
export function isWaitingOnUs(c: Pick<CrmCase, "status">) {
  return c.status === "waiting_on_us"
}

/** Not closed: Hill's `counts.open` counts every one of these. */
export function isOpenCrmCase(c: Pick<CrmCase, "status">) {
  return c.status !== "closed"
}

/** `case-12` → "#12"; anything else is shown as is. */
export function caseNumber(id: string) {
  const n = /^case-(\d+)$/.exec(id)?.[1]
  return n ? `#${n}` : id
}

export function personLabel(p: { name: string | null; email: string }) {
  return p.name?.trim() || p.email
}

/** The person's initials for an avatar: "Dana Whitfield" → "DW", "x@example.com" → "X". */
export function initials(p: { name: string | null; email: string }) {
  const words = (p.name?.trim() || p.email.split("@")[0] || "?").split(/[\s._-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? "?") + (words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "")).toUpperCase()
}

/**
 * What a recent-activity row says, from `type` and `actor` only (the
 * activity carries no text of its own): "Dana Whitfield wrote on #1",
 * "You replied on #1". `status_changed` is never sent today.
 */
export function activityText(a: Pick<CrmActivity, "type" | "caseId" | "actor">) {
  const n = caseNumber(a.caseId)
  switch (a.type) {
    case "received":
      return `${personLabel(a.actor)} wrote on ${n}`
    case "sent":
      return `You replied on ${n}`
    case "status_changed":
      return `Status changed on ${n}`
  }
}
