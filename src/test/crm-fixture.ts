import type { CrmAccount, CrmCase, CrmMessage, CrmSummary } from "@/lib/crm/types.ours"

/**
 * The rebuilt CRM's fixture, in Hill's new shape — pure data, no React, so
 * the Playwright specs import it too. Obviously fake people at
 * @example.com; never real mail, and never rendered outside tests.
 * Dated back from `nowMs` so "2h ago" stays true.
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
  charlie: { name: null, email: "charlie@example.com" },
} as const

export const FIXTURE_ACCOUNT = { id: "acct-test-1", name: "Example Test School", domain: "example.com" } as const

const iso = (ms: number) => new Date(ms).toISOString()

export function crmFixtureCases(nowMs: number): CrmCase[] {
  const base = { accountId: FIXTURE_ACCOUNT.id, labels: [] as string[] }
  return [
    {
      ...base,
      id: "case-test-1",
      threadId: "thread-test-1",
      subject: FIXTURE_SUBJECTS.urgent,
      contact: FIXTURE_PEOPLE.alpha,
      status: "waiting_on_us",
      priority: "urgent",
      waitingOnUsSince: iso(nowMs - 2 * HOUR),
      lastMessageAt: iso(nowMs - 2 * HOUR),
      lastMessageSnippet: "Still spinning after the update.",
      messageCount: 3,
      unread: true,
    },
    {
      ...base,
      id: "case-test-2",
      threadId: "thread-test-2",
      subject: FIXTURE_SUBJECTS.overdue,
      contact: FIXTURE_PEOPLE.bravo,
      status: "open",
      priority: "high",
      waitingOnUsSince: iso(nowMs - 5 * DAY),
      lastMessageAt: iso(nowMs - 5 * DAY),
      lastMessageSnippet: "It keeps sending me back to the login page.",
      messageCount: 1,
      unread: false,
    },
    {
      ...base,
      id: "case-test-3",
      threadId: "thread-test-3",
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
      id: "case-test-4",
      threadId: "thread-test-4",
      subject: FIXTURE_SUBJECTS.closed,
      contact: FIXTURE_PEOPLE.charlie,
      status: "closed",
      priority: "low",
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

/** Connected, in Hill's shape. */
export function crmFixtureSummary(nowMs: number): CrmSummary {
  return {
    status: "connected",
    lastUpdated: iso(nowMs - MIN),
    cases: crmFixtureCases(nowMs),
    accounts: crmFixtureAccounts(nowMs),
    recentActivity: [
      { id: "act-1", kind: "received", caseId: "case-test-1", at: iso(nowMs - 2 * HOUR), summary: "Test Person Alpha: Still spinning after the update." },
      { id: "act-2", kind: "sent", caseId: "case-test-3", at: iso(nowMs - 1 * DAY), summary: "You: Can you send the file you used?" },
    ],
    counts: { open: 3, waitingOnUs: 2, waitingOnThem: 1, closedThisWeek: 1 },
  }
}

/** Connected with nothing in the inbox. */
export function crmEmptySummary(nowMs: number): CrmSummary {
  return { ...crmFixtureSummary(nowMs), cases: [], accounts: [], recentActivity: [], counts: { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 } }
}

/** A script in the body that must never run or reach the DOM. */
export const HOSTILE_BODY =
  '<p>Hello from the test inbox</p><script>window.__crmPwned = true</script><img src="https://img.example.com/x.png" onerror="window.__crmPwned = true" alt="pic"><a href="javascript:window.__crmPwned=true">bad link</a><a href="https://example.com/help">safe link</a>'

export function crmFixtureThread(nowMs: number): CrmMessage[] {
  return [
    {
      id: "msg-test-1",
      direction: "inbound",
      from: FIXTURE_PEOPLE.alpha,
      to: ["support@example.com"],
      cc: [],
      sentAt: iso(nowMs - 3 * HOUR),
      bodyHtml: HOSTILE_BODY,
      bodyText: "Hello from the test inbox",
      attachments: [{ name: "screenshot.png", mimeType: "image/png", size: 2048 }],
    },
    {
      id: "msg-test-2",
      direction: "outbound",
      from: { name: "Support", email: "support@example.com" },
      to: [FIXTURE_PEOPLE.alpha.email],
      cc: [],
      sentAt: iso(nowMs - 2 * HOUR - 30 * MIN),
      bodyHtml: null,
      bodyText: "Thanks, looking now.\nSecond line.",
      attachments: [],
    },
  ]
}
