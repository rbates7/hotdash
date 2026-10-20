import { startOfWeek } from "@/lib/clock"
import type { Case, Contact, EmailMessage, Organization } from "@/lib/crm/crm"
import { parseGmailSummary, type CrmLiveData } from "@/lib/crm/gmail-summary"
import {
  CRM_CASE_STATUSES,
  CRM_NOT_CONNECTED,
  CRM_PRIORITIES,
  emptyCrmSummary,
  isOpenCrmCase,
  isWaitingOnUs,
  type CrmAccount,
  type CrmActivity,
  type CrmCase,
  type CrmCaseStatus,
  type CrmCounts,
  type CrmMessage,
  type CrmPerson,
  type CrmSummary,
} from "@/lib/crm/types.ours"

/**
 * `/api/crm/gmail` into the screens' own types (`types.ts`). Two bodies are
 * accepted, so the screens work before and after Hill's typed PR:
 *
 * - **Hill's shape** — `cases` and `counts` at the top level: checked row by
 *   row (a malformed row is dropped, never shown half-read) and passed on.
 * - **Today's `GmailSummary`** — `{ status, lastSyncedAt, mailbox, data }`:
 *   mapped here. `new`/`open` → open; `waiting` → waiting on them, unless
 *   their message is the newest → waiting on us. Counts, accounts and
 *   recent activity are worked out from the rows.
 */

const RECENT_ACTIVITY_LIMIT = 20

/* ---------------------------------------------------------------- guards */

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === "string"
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v)
const isInstant = (v: unknown): v is string => isStr(v) && Number.isFinite(Date.parse(v))
const isInstantOrNull = (v: unknown): v is string | null => v === null || isInstant(v)
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v)

function isPerson(v: unknown): v is CrmPerson {
  return isObj(v) && isStrOrNull(v.name) && isStr(v.email) && v.email.includes("@")
}

export function isCrmCase(v: unknown): v is CrmCase {
  return (
    isObj(v) &&
    isStr(v.id) &&
    v.id.length > 0 &&
    isStr(v.threadId) &&
    isStr(v.subject) &&
    isStrOrNull(v.accountId) &&
    isPerson(v.contact) &&
    oneOf(CRM_CASE_STATUSES, v.status) &&
    oneOf(CRM_PRIORITIES, v.priority) &&
    isInstantOrNull(v.waitingOnUsSince) &&
    isInstant(v.lastMessageAt) &&
    isStr(v.lastMessageSnippet) &&
    isCount(v.messageCount) &&
    typeof v.unread === "boolean" &&
    isStrList(v.labels)
  )
}

export function isCrmAccount(v: unknown): v is CrmAccount {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isStrOrNull(v.domain) &&
    Array.isArray(v.contacts) &&
    v.contacts.every(isPerson) &&
    isCount(v.openCases) &&
    isCount(v.waitingOnUsCount) &&
    isInstantOrNull(v.lastActivityAt)
  )
}

export function isCrmActivity(v: unknown): v is CrmActivity {
  return (
    isObj(v) &&
    isStr(v.id) &&
    oneOf(["received", "sent", "status_changed"] as const, v.kind) &&
    isStr(v.caseId) &&
    isInstant(v.at) &&
    isStr(v.summary)
  )
}

function isCounts(v: unknown): v is CrmCounts {
  return isObj(v) && isCount(v.open) && isCount(v.waitingOnUs) && isCount(v.waitingOnThem) && isCount(v.closedThisWeek)
}

export function isCrmMessage(v: unknown): v is CrmMessage {
  return (
    isObj(v) &&
    isStr(v.id) &&
    oneOf(["inbound", "outbound"] as const, v.direction) &&
    isPerson(v.from) &&
    isStrList(v.to) &&
    isStrList(v.cc) &&
    isInstant(v.sentAt) &&
    isStrOrNull(v.bodyHtml) &&
    isStrOrNull(v.bodyText) &&
    Array.isArray(v.attachments) &&
    v.attachments.every((a) => isObj(a) && isStr(a.name) && isStr(a.mimeType) && isCount(a.size))
  )
}

/** Hill's body: `cases` and `counts` at the top level. */
function isNewShape(v: Record<string, unknown>) {
  return "cases" in v && "counts" in v
}

function parseNewSummary(v: Record<string, unknown>): CrmSummary | null {
  if (!oneOf(["connected", "stale", "connecting", "not_connected"] as const, v.status)) return null
  if (v.status === "connecting" || v.status === "not_connected") return emptyCrmSummary(v.status)
  if (!isInstant(v.lastUpdated) || !isCounts(v.counts) || !Array.isArray(v.cases)) return null
  return {
    status: v.status,
    lastUpdated: v.lastUpdated,
    cases: v.cases.filter(isCrmCase),
    accounts: Array.isArray(v.accounts) ? v.accounts.filter(isCrmAccount) : [],
    recentActivity: Array.isArray(v.recentActivity) ? v.recentActivity.filter(isCrmActivity) : [],
    counts: v.counts,
  }
}

/* ------------------------------------------------- today's GmailSummary */

export function personName(c: Pick<Contact, "firstName" | "lastName">): string | null {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || null
}

const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b)

/** Their message is the newest thing on the case. */
function theySpokeLast(c: Pick<Case, "lastInboundAt" | "lastOutboundAt">) {
  return c.lastInboundAt !== null && (c.lastOutboundAt === null || byTime(c.lastInboundAt, c.lastOutboundAt) > 0)
}

export function mapLegacyStatus(c: Pick<Case, "status" | "lastInboundAt" | "lastOutboundAt">): CrmCaseStatus {
  switch (c.status) {
    case "new":
    case "open":
      return "open"
    case "waiting":
      return theySpokeLast(c) ? "waiting_on_us" : "waiting_on_them"
    case "closed":
      return "closed"
  }
}

function legacyCase(c: Case, contacts: ReadonlyMap<string, Contact>, thread: readonly EmailMessage[]): CrmCase {
  const contact = contacts.get(c.contactId)
  const last = thread.at(-1)
  const status = mapLegacyStatus(c)
  return {
    id: c.id,
    threadId: thread[0]?.threadId ?? "",
    subject: c.subject,
    accountId: contact?.organizationId ?? null,
    contact: { name: contact ? personName(contact) : null, email: contact?.email ?? "" },
    status,
    priority: c.priority,
    waitingOnUsSince: status !== "closed" && theySpokeLast(c) ? c.lastInboundAt : null,
    lastMessageAt: last?.sentAt ?? c.lastActivityAt ?? c.createdAt,
    lastMessageSnippet: last?.snippet ?? "",
    messageCount: thread.length,
    // Today's metadata carries no read state.
    unread: false,
    labels: [],
  }
}

/** Counts from the rows. "Open" is every case not closed. */
export function countCases(cases: readonly CrmCase[], closedThisWeek: number): CrmCounts {
  return {
    open: cases.filter(isOpenCrmCase).length,
    waitingOnUs: cases.filter(isWaitingOnUs).length,
    waitingOnThem: cases.filter((c) => c.status === "waiting_on_them").length,
    closedThisWeek,
  }
}

/**
 * One account per organization: its people, how many of their cases are
 * open and waiting on us, and the newest message across them.
 */
export function groupAccounts(
  organizations: readonly Pick<Organization, "id" | "name" | "domain">[],
  contacts: readonly { organizationId: string | null; person: CrmPerson }[],
  cases: readonly CrmCase[]
): CrmAccount[] {
  return organizations.map((org) => {
    const mine = cases.filter((c) => c.accountId === org.id)
    const latest = mine.reduce<string | null>(
      (max, c) => (max === null || byTime(c.lastMessageAt, max) > 0 ? c.lastMessageAt : max),
      null
    )
    return {
      id: org.id,
      name: org.name,
      domain: org.domain,
      contacts: contacts.filter((c) => c.organizationId === org.id).map((c) => c.person),
      openCases: mine.filter(isOpenCrmCase).length,
      waitingOnUsCount: mine.filter(isWaitingOnUs).length,
      lastActivityAt: latest,
    }
  })
}

function legacyActivity(messages: readonly EmailMessage[]): CrmActivity[] {
  return messages
    .filter((m): m is EmailMessage & { caseId: string } => m.caseId !== null)
    .sort((a, b) => byTime(b.sentAt, a.sentAt))
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((m) => ({
      id: m.id,
      kind: m.direction === "inbound" ? "received" : "sent",
      caseId: m.caseId,
      at: m.sentAt,
      summary: m.direction === "inbound" ? `${m.fromName ?? m.fromEmail}: ${m.snippet}` : `You: ${m.snippet}`,
    }))
}

export function fromLegacyData(data: CrmLiveData, nowMs: number): Omit<CrmSummary, "status" | "lastUpdated"> {
  const contacts = new Map(data.contacts.map((c) => [c.id, c]))
  const threads = new Map<string, EmailMessage[]>()
  for (const m of [...data.messages].sort((a, b) => byTime(a.sentAt, b.sentAt))) {
    if (!m.caseId) continue
    threads.set(m.caseId, [...(threads.get(m.caseId) ?? []), m])
  }
  const cases = data.cases
    .map((c) => legacyCase(c, contacts, threads.get(c.id) ?? []))
    .sort((a, b) => byTime(b.lastMessageAt, a.lastMessageAt))
  const weekStart = startOfWeek(new Date(nowMs)).getTime()
  const closedThisWeek = data.cases.filter(
    (c) => c.status === "closed" && c.closedAt !== null && Date.parse(c.closedAt) >= weekStart
  ).length
  const people = data.contacts.map((c) => ({
    organizationId: c.organizationId,
    person: { name: personName(c), email: c.email },
  }))
  return {
    cases,
    accounts: groupAccounts(data.organizations, people, cases),
    recentActivity: legacyActivity(data.messages),
    counts: countCases(cases, closedThisWeek),
  }
}

function legacyMessage(m: EmailMessage): CrmMessage {
  return {
    id: m.id,
    direction: m.direction,
    from: { name: m.fromName, email: m.fromEmail },
    to: m.toEmails,
    cc: [],
    sentAt: m.sentAt,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    attachments: m.attachments.map((a) => ({ name: a.filename, mimeType: a.mimeType, size: a.size })),
  }
}

/* ------------------------------------------------------------ entry points */

/** A body read defensively: null when it is neither shape (treat as a failed read). */
export function parseCrmSummary(raw: unknown, nowMs = Date.now()): CrmSummary | null {
  if (!isObj(raw)) return null
  if (isNewShape(raw)) return parseNewSummary(raw)
  const legacy = parseGmailSummary(raw)
  if (!legacy) return null
  if (legacy.status === "connecting" || legacy.status === "not_connected") return emptyCrmSummary(legacy.status)
  return { status: legacy.status, lastUpdated: legacy.lastSyncedAt, ...fromLegacyData(legacy.data, nowMs) }
}

/** As `parseCrmSummary`, with an unreadable body read as not connected. */
export function toCrmSummary(raw: unknown, nowMs = Date.now()): CrmSummary {
  return parseCrmSummary(raw, nowMs) ?? CRM_NOT_CONNECTED
}

/**
 * `GET /api/crm/gmail?caseId=<id>`: Hill's `{ messages }`, or today's whole
 * summary filtered to the case. Oldest first. Null when unreadable; an
 * inbox that is not connected has no thread (`[]`).
 */
export function toCrmThread(raw: unknown, caseId: string): CrmMessage[] | null {
  if (!isObj(raw)) return null
  const order = (xs: CrmMessage[]) => xs.sort((a, b) => byTime(a.sentAt, b.sentAt))
  if (Array.isArray(raw.messages) && !("data" in raw)) return order(raw.messages.filter(isCrmMessage))
  const legacy = parseGmailSummary(raw)
  if (!legacy) return null
  if (!legacy.data) return []
  return order(legacy.data.messages.filter((m) => m.caseId === caseId).map(legacyMessage))
}
