import { emptyCrmSummary, type CrmSummary } from "@/lib/crm/case-view"
import type { GmailSummary } from "@/lib/crm/gmail-summary"
import { buildCrmList } from "@/lib/crm/gmail-view"
import type { CrmAccount, CrmCase, CrmMessage, CrmThreadResponse } from "@/lib/crm/types"

/**
 * The rebuilt CRM's fixture, in Hill's exact shapes (`src/lib/crm/types.ts`)
 * — pure data, no React, so the Playwright specs import it too. Obviously
 * fake people at @example.com; never real mail, and never rendered outside
 * tests. Dated back from `nowMs` so "2h ago" stays true.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const FIXTURE_SUBJECTS = {
  overdue: "Test case: login loop on the test browser",
  waiting: "Test case: export times out",
  closed: "Test case: refund for a test charge",
  urgent: "Test case: invite button spins",
} as const

export const FIXTURE_PEOPLE = {
  alpha: { name: "Test Person Alpha", email: "alpha@example.com" },
  bravo: { name: "Test Person Bravo", email: "bravo@example.com" },
  /** A personal-domain sender: no account. */
  charlie: { name: null, email: "charlie@example.com" },
} as const

export const FIXTURE_MAILBOX = { name: null, email: "support@example.com" } as const

export const FIXTURE_ACCOUNT = { id: "org-1", name: "example.com", domain: "example.com" } as const

const iso = (ms: number) => new Date(ms).toISOString()

export function crmFixtureCases(nowMs: number): CrmCase[] {
  const base = { accountId: FIXTURE_ACCOUNT.id, labels: ["inbox"] }
  return [
    {
      ...base,
      id: "case-1",
      threadId: "thread-1",
      subject: FIXTURE_SUBJECTS.urgent,
      contact: FIXTURE_PEOPLE.alpha,
      status: "waiting_on_us",
      priority: "urgent",
      waitingOnUsSince: iso(nowMs - 2 * HOUR),
      lastMessageAt: iso(nowMs - 2 * HOUR),
      lastMessageSnippet: "Still spinning after the update.",
      messageCount: 3,
      unread: true,
      labels: ["inbox", "starred", "unread"],
    },
    {
      ...base,
      id: "case-2",
      threadId: "thread-2",
      subject: FIXTURE_SUBJECTS.overdue,
      contact: FIXTURE_PEOPLE.bravo,
      status: "waiting_on_us",
      priority: "high",
      waitingOnUsSince: iso(nowMs - 5 * DAY),
      lastMessageAt: iso(nowMs - 5 * DAY),
      lastMessageSnippet: "It keeps sending me back to the login page.",
      messageCount: 1,
      unread: false,
    },
    {
      ...base,
      id: "case-3",
      threadId: "thread-3",
      subject: FIXTURE_SUBJECTS.waiting,
      contact: FIXTURE_PEOPLE.alpha,
      status: "waiting_on_them",
      priority: "normal",
      waitingOnUsSince: null,
      lastMessageAt: iso(nowMs - 1 * DAY),
      lastMessageSnippet: "Can you send the file you used?",
      messageCount: 2,
      unread: false,
    },
    {
      accountId: null,
      labels: [],
      id: "case-4",
      threadId: "thread-4",
      subject: FIXTURE_SUBJECTS.closed,
      contact: FIXTURE_PEOPLE.charlie,
      status: "closed",
      priority: "normal",
      waitingOnUsSince: null,
      lastMessageAt: iso(nowMs - 3 * DAY),
      lastMessageSnippet: "Refunded, thanks.",
      messageCount: 2,
      unread: false,
    },
  ]
}

export function crmFixtureAccounts(nowMs: number): CrmAccount[] {
  return [
    {
      ...FIXTURE_ACCOUNT,
      contacts: [FIXTURE_PEOPLE.alpha, FIXTURE_PEOPLE.bravo],
      openCases: 3,
      waitingOnUsCount: 2,
      lastActivityAt: iso(nowMs - 2 * HOUR),
    },
  ]
}

/** Connected: a `CrmListResponse` as `GET /api/crm/gmail` sends it. */
export function crmFixtureSummary(nowMs: number): CrmSummary {
  return {
    status: "connected",
    lastUpdated: iso(nowMs - MIN),
    counts: { open: 3, waitingOnUs: 2, waitingOnThem: 1, closedThisWeek: 1 },
    cases: crmFixtureCases(nowMs),
    accounts: crmFixtureAccounts(nowMs),
    recentActivity: [
      { type: "received", caseId: "case-1", at: iso(nowMs - 2 * HOUR), actor: FIXTURE_PEOPLE.alpha },
      { type: "sent", caseId: "case-3", at: iso(nowMs - 1 * DAY), actor: FIXTURE_MAILBOX },
    ],
  }
}

/** Connected with nothing in the inbox. */
export function crmEmptySummary(nowMs: number): CrmSummary {
  return {
    ...crmFixtureSummary(nowMs),
    counts: { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 },
    cases: [],
    accounts: [],
    recentActivity: [],
  }
}

/** Not connected, exactly as the route sends it: the counts are present and all zero. */
export function crmNotConnectedBody(): CrmSummary {
  return {
    status: "not_connected",
    lastUpdated: null,
    counts: { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 },
    cases: [],
    accounts: [],
    recentActivity: [],
  }
}

/** Markup in a plain-text body: it must show as literal text, never as elements. */
export const HOSTILE_TEXT = "<script>alert(1)</script><b>hi</b>"

export function crmFixtureThread(nowMs: number): CrmMessage[] {
  return [
    {
      id: "thread-1-m1",
      threadId: "thread-1",
      direction: "inbound",
      from: FIXTURE_PEOPLE.alpha,
      to: [FIXTURE_MAILBOX],
      cc: [],
      sentAt: iso(nowMs - 3 * HOUR),
      bodyText: `Hello from the test inbox\n${HOSTILE_TEXT}`,
      attachments: [{ name: "screenshot.png", size: 2048, mimeType: "image/png" }],
    },
    {
      id: "thread-1-m2",
      threadId: "thread-1",
      direction: "outbound",
      from: FIXTURE_MAILBOX,
      to: [FIXTURE_PEOPLE.alpha],
      cc: [],
      sentAt: iso(nowMs - 2 * HOUR - 30 * MIN),
      bodyText: "Thanks, looking now.\nSecond line.",
      attachments: [],
    },
  ]
}

/* ------------------------------------------- develop's Gmail fixture, as the route */

/**
 * The `CrmListResponse` the route sends beside develop's `GmailSummary`
 * (the same inbox): built with Hill's own `buildCrmList`, as
 * `gmailService.list()` does, so develop's store (header menu, Contacts,
 * Triage) and the rebuilt screens agree.
 */
export function crmSummaryFromGmail(summary: GmailSummary, nowMs: number): CrmSummary {
  if (summary.status === "connecting" || summary.status === "not_connected" || !summary.data) {
    return emptyCrmSummary(summary.status === "connecting" ? "connecting" : "not_connected")
  }
  return {
    status: summary.status,
    lastUpdated: summary.lastSyncedAt,
    ...buildCrmList([], { mailbox: summary.mailbox, nowMs, data: summary.data }),
  }
}

/** The whole body `GET /api/crm/gmail` sends: Hill's list plus the older fields. */
export function crmRouteBody(summary: GmailSummary, nowMs: number) {
  return { ...summary, ...crmSummaryFromGmail(summary, nowMs) }
}

/**
 * `GET /api/crm/gmail?caseId=<id>` for develop's fixture: that case's
 * messages as plain text, or null for an unknown case (the route's 404).
 */
export function crmThreadFromGmail(summary: GmailSummary, caseId: string): CrmThreadResponse | null {
  const data = summary.data
  if (summary.status === "connecting" || summary.status === "not_connected" || !data) {
    return { status: summary.status === "connecting" ? "connecting" : "not_connected", lastUpdated: null, caseId, messages: [] }
  }
  const c = data.cases.find((x) => x.id === caseId)
  if (!c) return null
  const threadId = `thread-${c.caseNumber}`
  const messages: CrmMessage[] = data.messages
    .filter((m) => m.caseId === caseId)
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
    .map((m, i) => ({
      id: `${threadId}-m${i + 1}`,
      threadId,
      direction: m.direction,
      from: { name: m.fromName, email: m.fromEmail },
      to: m.toEmails.map((email) => ({ name: null, email })),
      cc: [],
      sentAt: m.sentAt,
      bodyText: m.bodyText ?? m.snippet,
      attachments: m.attachments.map((a) => ({ name: a.filename, size: a.size, mimeType: a.mimeType })),
    }))
  return { status: summary.status, lastUpdated: summary.lastSyncedAt, caseId, messages }
}

/** `GET /api/crm/gmail?caseId=case-1`, connected. */
export function crmFixtureThreadBody(nowMs: number, caseId = "case-1"): CrmThreadResponse {
  return { status: "connected", lastUpdated: iso(nowMs - MIN), caseId, messages: crmFixtureThread(nowMs) }
}
