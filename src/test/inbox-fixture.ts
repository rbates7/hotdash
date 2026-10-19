import type { InboxResponse, InboxSourceId, InboxSourceState, RealInboxItem } from "@/lib/inbox-sources"
import type { InboxItem } from "@/lib/workplace-fixture"

/**
 * Inbox data for tests and e2e mocks — pure data, no React, so the
 * Playwright specs can import it too. Invented PRs and Sentry issues, never
 * real customers. Dated back from `nowMs` so "18m" stays true.
 */

const MIN = 60_000
const ago = (nowMs: number, m: number) => new Date(nowMs - m * MIN).toISOString()

const PR = (n: number) => `https://github.com/rbates7/hotdash/pull/${n}`
const ISSUE = (n: number) => `https://chlk.sentry.io/issues/${n}/`

/** Five rows: three need the founder, two are informational. */
export function liveInboxItems(nowMs: number): RealInboxItem[] {
  return [
    { id: "github-pr-912", source: "github", title: "PR ready for review", snippet: "#912 Roster import handles accented names", at: ago(nowMs, 18), unread: true, url: PR(912) },
    { id: "sentry-7001", source: "sentry", title: "Crash · New issue", snippet: "CHLK-IOS-4F Crash opening a practice plan · 12 events, 4 users", at: ago(nowMs, 95), unread: true, url: ISSUE(7001) },
    { id: "github-pr-909", source: "github", title: "PR needs a fix · CI failing", snippet: "#909 Faster season calendar", at: ago(nowMs, 160), unread: false, url: PR(909) },
    { id: "sentry-7002", source: "sentry", title: "Error · Regressed", snippet: "CHLK-IOS-3A Video upload times out on cellular · 31 events, 9 users", at: ago(nowMs, 240), unread: true, url: ISSUE(7002) },
    { id: "sentry-7003", source: "sentry", title: "Error · Ongoing", snippet: "CHLK-IOS-2C Image cache miss on cold start · 3 events, 2 users", at: ago(nowMs, 600), unread: false, url: ISSUE(7003) },
  ]
}

const state = (status: InboxSourceState["status"], fetchedAt: string | null): InboxSourceState => ({ status, fetchedAt })

function sources(github: InboxSourceState, sentry: InboxSourceState): Record<InboxSourceId, InboxSourceState> {
  return { github, sentry, gmail: state("not_connected", null) }
}

/** GitHub and Sentry connected with rows (Gmail is still a stub). */
export function liveInbox(nowMs: number): InboxResponse {
  const at = new Date(nowMs).toISOString()
  return { fetchedAt: at, sources: sources(state("connected", at), state("connected", at)), items: liveInboxItems(nowMs) }
}

/** The same rows, both sources' last sync 47 minutes old. */
export function staleInbox(nowMs: number): InboxResponse {
  const then = ago(nowMs, 47)
  return {
    fetchedAt: new Date(nowMs).toISOString(),
    sources: sources(state("stale", then), state("stale", then)),
    items: liveInboxItems(nowMs - 47 * MIN),
  }
}

/** Connected, nothing waiting. */
export function emptyInbox(nowMs: number): InboxResponse {
  const at = new Date(nowMs).toISOString()
  return { fetchedAt: at, sources: sources(state("connected", at), state("connected", at)), items: [] }
}

/** Tokens set, first sync still running. */
export function connectingInbox(nowMs: number): InboxResponse {
  return {
    fetchedAt: new Date(nowMs).toISOString(),
    sources: sources(state("connecting", null), state("connecting", null)),
    items: [],
  }
}

/** No tokens (or a failed first sync): what the real server says in e2e. */
export function notConnectedInbox(nowMs: number): InboxResponse {
  return {
    fetchedAt: new Date(nowMs).toISOString(),
    sources: sources(state("not_connected", null), state("not_connected", null)),
    items: [],
  }
}

/* ------------------------------------------------- legacy sample rows */

/**
 * The design mock's old Inbox rows (ticket-linked), kept only to unit-test
 * the board-aware selectors in `@/lib/inbox` and `@/lib/home`. No screen
 * renders these any more.
 */
// 18 minutes, 2 hours, 4 hours and a day old.
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
