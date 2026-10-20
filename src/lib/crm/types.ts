/**
 * The CRM screen's contract with GET /api/crm/gmail (agreed with Koenig,
 * Oct 19 2026). Both requests are behind the dashboard gate: logged out,
 * /api/* answers 401.
 *
 *   GET /api/crm/gmail               -> CrmListResponse
 *   GET /api/crm/gmail?caseId=<id>   -> CrmThreadResponse
 *
 * Built from the support inbox only. No owner, plan or Stripe standing.
 * Every timestamp is an ISO 8601 UTC string.
 */

/** The #50 live-data states, the same as every other panel. */
export type CrmFeedStatus = "connected" | "stale" | "connecting" | "not_connected"

export type CrmCaseStatus = "open" | "waiting_on_us" | "waiting_on_them" | "closed"
export type CrmCasePriority = "low" | "normal" | "high" | "urgent"
export type CrmDirection = "inbound" | "outbound"

export type CrmPerson = { name: string | null; email: string }

export type CrmCase = {
  /** `case-<n>`; stable for the life of the server process. */
  id: string
  /** `thread-<n>`; never Gmail's own id. */
  threadId: string
  subject: string
  /** null when the contact writes from a personal domain (gmail.com, yahoo.com, outlook.com). */
  accountId: string | null
  contact: CrmPerson
  status: CrmCaseStatus
  priority: CrmCasePriority
  /** When the oldest unanswered customer message arrived; null unless status is waiting_on_us. */
  waitingOnUsSince: string | null
  lastMessageAt: string
  /** Plain text, HTML entities decoded. */
  lastMessageSnippet: string
  messageCount: number
  /** Any message in the thread still has Gmail's UNREAD label. */
  unread: boolean
  /** Gmail system labels, lower case: inbox, starred, important, unread, sent. */
  labels: string[]
}

export type CrmAttachment = { name: string; size: number; mimeType: string }

export type CrmMessage = {
  id: string
  threadId: string
  direction: CrmDirection
  from: CrmPerson
  to: CrmPerson[]
  cc: CrmPerson[]
  sentAt: string
  /**
   * Plain text only: the text/plain part, or the HTML part reduced to text, or
   * the snippet, with any tags removed on the server. No HTML is ever sent.
   */
  bodyText: string
  /** Metadata only; no attachment bytes are ever fetched. */
  attachments: CrmAttachment[]
}

export type CrmAccount = {
  /** `org-<n>` */
  id: string
  /** The email domain (Gmail does not know the school's name). */
  name: string
  domain: string
  contacts: CrmPerson[]
  /** Cases not closed. */
  openCases: number
  waitingOnUsCount: number
  lastActivityAt: string | null
}

/**
 * Derived from messages only. Gmail keeps no status history, so
 * status_changed is never emitted today; the type keeps the slot.
 */
export type CrmActivity = {
  type: "received" | "sent" | "status_changed"
  caseId: string
  at: string
  /** Who did it: the customer for received, the mailbox for sent. */
  actor: CrmPerson
}

export type CrmCounts = {
  /** Cases not closed (waiting_on_us + waiting_on_them + open). */
  open: number
  waitingOnUs: number
  waitingOnThem: number
  /** Closed cases whose last message is within the last 7 days. */
  closedThisWeek: number
}

type Envelope = {
  status: CrmFeedStatus
  /** When the data was last read from Gmail successfully; null with no data. */
  lastUpdated: string | null
}

export type CrmListResponse = Envelope & {
  counts: CrmCounts
  cases: CrmCase[]
  accounts: CrmAccount[]
  /** Newest first, at most 50. */
  recentActivity: CrmActivity[]
}

export type CrmThreadResponse = Envelope & {
  caseId: string
  /** Oldest first. Empty when not connected, or the case is unknown (then the HTTP status is 404). */
  messages: CrmMessage[]
}
