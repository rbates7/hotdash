import { CRM_CASE_STATUSES, CRM_PRIORITIES, emptyCrmSummary, type CrmSummary } from "@/lib/crm/case-view"
import type { CrmAccount, CrmActivity, CrmCase, CrmCounts, CrmMessage, CrmPerson } from "@/lib/crm/types"

/**
 * `/api/crm/gmail` read defensively into Hill's types (`types.ts`). Rows
 * are checked one by one and a malformed row is dropped, never shown half
 * read. The route's older fields (`lastSyncedAt`, `mailbox`, `data`) are
 * ignored here: develop's store reads them for Contacts and Triage.
 */

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

const isPersonList = (v: unknown): v is CrmPerson[] => Array.isArray(v) && v.every(isPerson)

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
    isStr(v.domain) &&
    isPersonList(v.contacts) &&
    isCount(v.openCases) &&
    isCount(v.waitingOnUsCount) &&
    isInstantOrNull(v.lastActivityAt)
  )
}

export function isCrmActivity(v: unknown): v is CrmActivity {
  return (
    isObj(v) &&
    oneOf(["received", "sent", "status_changed"] as const, v.type) &&
    isStr(v.caseId) &&
    isInstant(v.at) &&
    isPerson(v.actor)
  )
}

function isCounts(v: unknown): v is CrmCounts {
  return isObj(v) && isCount(v.open) && isCount(v.waitingOnUs) && isCount(v.waitingOnThem) && isCount(v.closedThisWeek)
}

export function isCrmMessage(v: unknown): v is CrmMessage {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.threadId) &&
    oneOf(["inbound", "outbound"] as const, v.direction) &&
    isPerson(v.from) &&
    isPersonList(v.to) &&
    isPersonList(v.cc) &&
    isInstant(v.sentAt) &&
    isStr(v.bodyText) &&
    Array.isArray(v.attachments) &&
    v.attachments.every((a) => isObj(a) && isStr(a.name) && isStr(a.mimeType) && isCount(a.size))
  )
}

/** Only the fields of Hill's message; anything else on the wire (an HTML body included) is dropped. */
function pickMessage(m: CrmMessage): CrmMessage {
  const { id, threadId, direction, from, to, cc, sentAt, bodyText, attachments } = m
  return { id, threadId, direction, from, to, cc, sentAt, bodyText, attachments }
}

/* ------------------------------------------------------------ entry points */

/**
 * A `CrmListResponse`, or null when the body is unreadable (treated as a
 * failed read). Connecting / not connected carry no rows, whatever came.
 */
export function parseCrmSummary(raw: unknown): CrmSummary | null {
  if (!isObj(raw)) return null
  if (!oneOf(["connected", "stale", "connecting", "not_connected"] as const, raw.status)) return null
  if (raw.status === "connecting" || raw.status === "not_connected") return emptyCrmSummary(raw.status)
  if (!isInstant(raw.lastUpdated) || !isCounts(raw.counts) || !Array.isArray(raw.cases)) return null
  return {
    status: raw.status,
    lastUpdated: raw.lastUpdated,
    counts: raw.counts,
    cases: raw.cases.filter(isCrmCase),
    accounts: Array.isArray(raw.accounts) ? raw.accounts.filter(isCrmAccount) : [],
    recentActivity: Array.isArray(raw.recentActivity) ? raw.recentActivity.filter(isCrmActivity) : [],
  }
}

/** `GET /api/crm/gmail?caseId=<id>` (`CrmThreadResponse`): its messages, oldest first, or null when unreadable. */
export function toCrmThread(raw: unknown): CrmMessage[] | null {
  if (!isObj(raw) || !Array.isArray(raw.messages)) return null
  return raw.messages
    .filter(isCrmMessage)
    .map(pickMessage)
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
}
