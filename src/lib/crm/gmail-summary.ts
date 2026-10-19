import {
  isCase,
  isContact,
  isEmailMessage,
  isOrganization,
  type Case,
  type Contact,
  type EmailMessage,
  type Organization,
} from "@/lib/crm/crm"
import { dedupe } from "@/lib/persistence"

/**
 * What `/api/crm/gmail` returns, shared by the route and the browser. No
 * client ID, secret or token, no error text: only the support inbox's
 * threads, already in the CRM's own shapes (`src/lib/crm/crm.ts`), and when
 * they were synced.
 *
 * - `connected`     — the last sync succeeded within the cache window.
 * - `stale`         — Gmail could not be read (down, access revoked or
 *                     removed); these are the last good threads, as of
 *                     `lastSyncedAt`.
 * - `connecting`    — credentials are set and the first sync is still
 *                     running (a fresh server, just after a deploy): no
 *                     data yet, and never the sample in its place. The
 *                     same rule as Stripe's (`@/lib/server/stripe`).
 * - `not_connected` — no credentials, or no sync has ever succeeded (a
 *                     failed first sync, and every retry after it, is not
 *                     connecting again): no data, and the CRM keeps its
 *                     labelled sample.
 */
export type GmailStatus = "connected" | "stale" | "connecting" | "not_connected"

/** The CRM's rows built from Gmail threads. No notes: Gmail has none. */
export type CrmLiveData = {
  organizations: Organization[]
  contacts: Contact[]
  cases: Case[]
  messages: EmailMessage[]
}

export type GmailSummary = { mailbox: string } & (
  | { status: "connected" | "stale"; lastSyncedAt: string; data: CrmLiveData }
  | { status: "connecting"; lastSyncedAt: null; data: null }
  | { status: "not_connected"; lastSyncedAt: null; data: null }
)

/** A summary with rows: connected, or the last good copy (stale). */
export type LiveGmailSummary = Extract<GmailSummary, { status: "connected" | "stale" }>

/** The support inbox, shown when `GMAIL_MAILBOX` is not set. */
export const DEFAULT_MAILBOX = "info@chlkapp.com"

export function gmailNotConnected(mailbox: string = DEFAULT_MAILBOX): GmailSummary {
  return { status: "not_connected", lastSyncedAt: null, data: null, mailbox }
}

export const GMAIL_NOT_CONNECTED: GmailSummary = gmailNotConnected()

export function gmailConnecting(mailbox: string = DEFAULT_MAILBOX): GmailSummary {
  return { status: "connecting", lastSyncedAt: null, data: null, mailbox }
}

/** `/api/health/gmail`: a status word, nothing else. */
export type GmailHealth = "ok" | "connecting" | "error" | "not_configured"

export const GMAIL_SUMMARY_PATH = "/api/crm/gmail"
export const GMAIL_HEALTH_PATH = "/api/health/gmail"

const MAILBOX = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/

/**
 * Whether `value` is a complete, self-consistent set of CRM rows: every row
 * passes the CRM's own guard, ids are unique, and every reference points at
 * a row that is there. The server checks a sync with it before the copy
 * replaces a good one; the browser checks the response with it.
 */
export function isCrmLiveData(value: unknown): value is CrmLiveData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.organizations) || !v.organizations.every(isOrganization)) return false
  if (!Array.isArray(v.contacts) || !v.contacts.every(isContact)) return false
  if (!Array.isArray(v.cases) || !v.cases.every(isCase)) return false
  if (!Array.isArray(v.messages) || !v.messages.every(isEmailMessage)) return false
  const unique = (xs: readonly unknown[]) => dedupe(xs).length === xs.length
  if (!unique(v.organizations.map((o) => o.id))) return false
  if (!unique(v.contacts.map((c) => c.id)) || !unique(v.contacts.map((c) => c.email))) return false
  if (!unique(v.cases.map((c) => c.id)) || !unique(v.cases.map((c) => c.caseNumber))) return false
  if (!unique(v.messages.map((m) => m.id))) return false
  const orgIds = new Set(v.organizations.map((o) => o.id))
  if (v.contacts.some((c) => c.organizationId && !orgIds.has(c.organizationId))) return false
  const contactIds = new Set(v.contacts.map((c) => c.id))
  if (v.cases.some((c) => !contactIds.has(c.contactId))) return false
  const caseIds = new Set(v.cases.map((c) => c.id))
  return !v.messages.some((m) => m.caseId && !caseIds.has(m.caseId))
}

/**
 * A response body read back defensively: anything that is not a complete
 * summary is null, and the caller treats it like an unreachable endpoint.
 */
export function parseGmailSummary(value: unknown): GmailSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const mailbox = typeof v.mailbox === "string" && MAILBOX.test(v.mailbox) ? v.mailbox : DEFAULT_MAILBOX
  if (v.status === "not_connected") return gmailNotConnected(mailbox)
  if (v.status === "connecting") return gmailConnecting(mailbox)
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  if (!isCrmLiveData(v.data)) return null
  const { organizations, contacts, cases, messages } = v.data
  return { status: v.status, lastSyncedAt: v.lastSyncedAt, mailbox, data: { organizations, contacts, cases, messages } }
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until `/api/crm/gmail` first answers. */
export type GmailView = { phase: "loading" } | { phase: "ready"; summary: GmailSummary }

/**
 * What the CRM shows:
 * - `loading` — skeletons (never sample rows that then swap for real ones);
 *               `connecting` while the server's first sync runs, as in
 *               `StripeFeed` (Settings and the CRM header say so);
 * - `not_connected` — Gmail is not connected: the CRM keeps its seed rows,
 *               labelled Sample data (the rows, not the feed, are sample);
 * - `live`    — the support inbox; `stale` adds "Last updated …".
 */
export type GmailFeed =
  | { kind: "loading"; connecting?: boolean }
  | { kind: "not_connected"; mailbox: string }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; mailbox: string; data: CrmLiveData }

export function gmailFeedOf(view: GmailView): GmailFeed {
  if (view.phase === "loading") return { kind: "loading" }
  const { summary } = view
  if (summary.status === "connecting") return { kind: "loading", connecting: true }
  if (summary.status === "not_connected") return { kind: "not_connected", mailbox: summary.mailbox }
  return {
    kind: "live",
    stale: summary.status === "stale",
    lastSyncedAt: new Date(summary.lastSyncedAt),
    mailbox: summary.mailbox,
    data: summary.data,
  }
}
