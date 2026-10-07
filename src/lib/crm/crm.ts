import { CENTRAL, formatRelative } from "@/lib/clock"
import type { Plan } from "@/lib/metrics"
import {
  isFiniteNumber,
  isIsoInstant,
  isString,
  isStringOrNull,
} from "@/lib/persistence"

import { normalizeEmail } from "./matching"

export type { Plan }

/**
 * CRM domain: cases, contacts, notes and a triage queue. Ported from the
 * Sept 1 discovery app as sample data until Gmail/Stripe sync lands.
 * Shapes stay close to that model so a later live-data PR can swap the store.
 */

export const CASE_STATUSES = ["new", "open", "waiting", "closed"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type CasePriority = (typeof CASE_PRIORITIES)[number]

export const NAME_SOURCES = ["gmail", "stripe", "supabase", "manual"] as const
export type NameSource = (typeof NAME_SOURCES)[number]

export const CONTACT_SOURCES = ["gmail", "stripe", "manual"] as const
export type ContactSource = (typeof CONTACT_SOURCES)[number]

export const PLANS = ["Monthly", "Annual", "Staff"] as const

export function isPlan(value: unknown): value is Plan {
  return isString(value) && (PLANS as readonly string[]).includes(value)
}

export const NOTE_KINDS = ["user", "system"] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

export const TRIAGE_STATES = ["pending", "ignored"] as const
export type TriageState = (typeof TRIAGE_STATES)[number]

export const STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  open: "Open",
  waiting: "Waiting on customer",
  closed: "Closed",
}

export const PRIORITY_LABELS: Record<CasePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}

export const OPEN_STATUSES: readonly CaseStatus[] = ["new", "open", "waiting"]

export const CRM_LIMITS = {
  subject: 160,
  name: 60,
  email: 120,
  org: 80,
  note: 2_000,
  body: 20_000,
  plan: 40,
  snippet: 240,
  filename: 120,
} as const

export const FOUNDER_EMAIL = "rashad@chlk.xyz"

export type Organization = {
  id: string
  name: string
  domain: string | null
}

export type Contact = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  nameSource: NameSource | null
  organizationId: string | null
  plan: Plan | null
  planStatus: string | null
  source: ContactSource
  createdAt: string
}

export type Case = {
  id: string
  caseNumber: number
  subject: string
  status: CaseStatus
  priority: CasePriority
  contactId: string
  lastActivityAt: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  closedAt: string | null
  createdAt: string
}

export type Attachment = {
  filename: string
  mimeType: string
  size: number
}

export type EmailMessage = {
  id: string
  threadId: string
  caseId: string | null
  triageState: TriageState | null
  direction: MessageDirection
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  subject: string
  snippet: string
  bodyText: string
  bodyHtml: string | null
  attachments: Attachment[]
  sentAt: string
}

export type Note = {
  id: string
  caseId: string
  kind: NoteKind
  body: string
  createdAt: string
}

export type ContactInput = {
  email: string
  firstName?: string | null
  lastName?: string | null
  organizationName?: string | null
}

/* ---------------------------------------------------------------- guards */

export function isCaseStatus(value: unknown): value is CaseStatus {
  return isString(value) && (CASE_STATUSES as readonly string[]).includes(value)
}

export function isCasePriority(value: unknown): value is CasePriority {
  return isString(value) && (CASE_PRIORITIES as readonly string[]).includes(value)
}

export function isNameSource(value: unknown): value is NameSource {
  return isString(value) && (NAME_SOURCES as readonly string[]).includes(value)
}

export function isContactSource(value: unknown): value is ContactSource {
  return isString(value) && (CONTACT_SOURCES as readonly string[]).includes(value)
}

const isText = (v: unknown, max: number): v is string => isString(v) && v.length <= max
const isOptionalText = (v: unknown, max: number): v is string | null =>
  v === null || isText(v, max)

export const ORG_ID = /^org-(\d+)$/
export const CONTACT_ID = /^contact-(\d+)$/
export const CASE_ID = /^case-(\d+)$/
export const MESSAGE_ID = /^message-(\d+)$/
export const NOTE_ID = /^note-(\d+)$/
export const THREAD_ID = /^thread-(\d+)$/

export function idNumber(id: string, re: RegExp) {
  const m = re.exec(id)
  return m ? Number(m[1]) : 0
}

export function isOrganization(value: unknown): value is Organization {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    ORG_ID.test(v.id) &&
    isText(v.name, CRM_LIMITS.org) &&
    v.name.trim().length > 0 &&
    isOptionalText(v.domain, CRM_LIMITS.email)
  )
}

export function isContact(value: unknown): value is Contact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    CONTACT_ID.test(v.id) &&
    isText(v.email, CRM_LIMITS.email) &&
    v.email.includes("@") &&
    isOptionalText(v.firstName, CRM_LIMITS.name) &&
    isOptionalText(v.lastName, CRM_LIMITS.name) &&
    (v.nameSource === null || isNameSource(v.nameSource)) &&
    (v.organizationId === null || (isString(v.organizationId) && ORG_ID.test(v.organizationId))) &&
    (v.plan === null || isPlan(v.plan)) &&
    isOptionalText(v.planStatus, CRM_LIMITS.plan) &&
    isContactSource(v.source) &&
    isIsoInstant(v.createdAt)
  )
}

export function isCase(value: unknown): value is Case {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    CASE_ID.test(v.id) &&
    isFiniteNumber(v.caseNumber) &&
    Number.isInteger(v.caseNumber) &&
    v.caseNumber > 0 &&
    isText(v.subject, CRM_LIMITS.subject) &&
    v.subject.trim().length > 0 &&
    isCaseStatus(v.status) &&
    isCasePriority(v.priority) &&
    isString(v.contactId) &&
    CONTACT_ID.test(v.contactId) &&
    isStringOrNull(v.lastActivityAt) &&
    (v.lastActivityAt === null || isIsoInstant(v.lastActivityAt)) &&
    isStringOrNull(v.lastInboundAt) &&
    (v.lastInboundAt === null || isIsoInstant(v.lastInboundAt)) &&
    isStringOrNull(v.lastOutboundAt) &&
    (v.lastOutboundAt === null || isIsoInstant(v.lastOutboundAt)) &&
    isStringOrNull(v.closedAt) &&
    (v.closedAt === null || isIsoInstant(v.closedAt)) &&
    isIsoInstant(v.createdAt)
  )
}

export function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isText(v.filename, CRM_LIMITS.filename) &&
    isText(v.mimeType, 80) &&
    isFiniteNumber(v.size) &&
    Number.isInteger(v.size) &&
    v.size >= 0
  )
}

export function isEmailMessage(value: unknown): value is EmailMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    MESSAGE_ID.test(v.id) &&
    isString(v.threadId) &&
    THREAD_ID.test(v.threadId) &&
    (v.caseId === null || (isString(v.caseId) && CASE_ID.test(v.caseId))) &&
    (v.triageState === null ||
      (isString(v.triageState) && (TRIAGE_STATES as readonly string[]).includes(v.triageState))) &&
    isString(v.direction) &&
    (MESSAGE_DIRECTIONS as readonly string[]).includes(v.direction) &&
    isText(v.fromEmail, CRM_LIMITS.email) &&
    isOptionalText(v.fromName, CRM_LIMITS.name) &&
    Array.isArray(v.toEmails) &&
    v.toEmails.every((e) => isText(e, CRM_LIMITS.email)) &&
    isText(v.subject, CRM_LIMITS.subject) &&
    isText(v.snippet, CRM_LIMITS.snippet) &&
    isText(v.bodyText, CRM_LIMITS.body) &&
    isOptionalText(v.bodyHtml, CRM_LIMITS.body) &&
    Array.isArray(v.attachments) &&
    v.attachments.every(isAttachment) &&
    isIsoInstant(v.sentAt)
  )
}

export function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    NOTE_ID.test(v.id) &&
    isString(v.caseId) &&
    CASE_ID.test(v.caseId) &&
    isString(v.kind) &&
    (NOTE_KINDS as readonly string[]).includes(v.kind) &&
    isText(v.body, CRM_LIMITS.note) &&
    v.body.trim().length > 0 &&
    isIsoInstant(v.createdAt)
  )
}

/* -------------------------------------------------------------- strip */

export function stripOrganization(o: Organization): Organization {
  return { id: o.id, name: o.name, domain: o.domain }
}

export function stripContact(c: Contact): Contact {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    nameSource: c.nameSource,
    organizationId: c.organizationId,
    plan: c.plan,
    planStatus: c.planStatus,
    source: c.source,
    createdAt: c.createdAt,
  }
}

export function stripCase(c: Case): Case {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    contactId: c.contactId,
    lastActivityAt: c.lastActivityAt,
    lastInboundAt: c.lastInboundAt,
    lastOutboundAt: c.lastOutboundAt,
    closedAt: c.closedAt,
    createdAt: c.createdAt,
  }
}

export function stripMessage(m: EmailMessage): EmailMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    caseId: m.caseId,
    triageState: m.triageState,
    direction: m.direction,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    toEmails: [...m.toEmails],
    subject: m.subject,
    snippet: m.snippet,
    bodyText: m.bodyText,
    bodyHtml: m.bodyHtml,
    attachments: m.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    })),
    sentAt: m.sentAt,
  }
}

export function stripNote(n: Note): Note {
  return { id: n.id, caseId: n.caseId, kind: n.kind, body: n.body, createdAt: n.createdAt }
}

/* ----------------------------------------------------------- display */

export function contactDisplayName(contact: Pick<Contact, "firstName" | "lastName" | "email">) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  return name || contact.email
}

export function contactInitials(contact: Pick<Contact, "firstName" | "lastName" | "email">) {
  const first = contact.firstName?.trim()
  const last = contact.lastName?.trim()
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  return contact.email.slice(0, 2).toUpperCase()
}

export function isOpenStatus(status: CaseStatus) {
  return (OPEN_STATUSES as readonly string[]).includes(status)
}

export function isOpenCase(c: Pick<Case, "status">) {
  return isOpenStatus(c.status)
}

export function orgOf(
  organizations: readonly Organization[],
  id: string | null
): Organization | null {
  if (!id) return null
  return organizations.find((o) => o.id === id) ?? null
}

export function contactOf(contacts: readonly Contact[], id: string): Contact | undefined {
  return contacts.find((c) => c.id === id)
}

export function openCaseCount(cases: readonly Case[], contactId: string) {
  return cases.filter((c) => c.contactId === contactId && isOpenCase(c)).length
}

export function countByStatus(cases: readonly Case[]) {
  const counts = { new: 0, open: 0, waiting: 0, closed: 0 }
  for (const c of cases) counts[c.status] += 1
  return counts
}

export function urgentOpenCount(cases: readonly Case[]) {
  return cases.filter((c) => isOpenCase(c) && c.priority === "urgent").length
}

export function oldestUntouched(cases: readonly Case[], limit = 5) {
  return cases
    .filter((c) => c.status === "new" || c.status === "open")
    .slice()
    .sort((a, b) => {
      const at = a.lastActivityAt ?? a.createdAt
      const bt = b.lastActivityAt ?? b.createdAt
      if (at !== bt) return at < bt ? -1 : 1
      return a.caseNumber - b.caseNumber
    })
    .slice(0, limit)
}

export type ActivityItem =
  | { kind: "message"; at: string; message: EmailMessage }
  | { kind: "note"; at: string; note: Note }

export function recentActivity(
  messages: readonly EmailMessage[],
  notes: readonly Note[],
  limit = 10
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...messages
      .filter((m) => m.caseId)
      .map((message) => ({ kind: "message" as const, at: message.sentAt, message })),
    ...notes
      .filter((n) => n.kind === "user")
      .map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
  ]
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit)
}

export type TriageThread = {
  threadId: string
  senderEmail: string
  senderName: string | null
  subject: string
  snippet: string
  latestAt: string
  messageCount: number
}

export function listTriageThreads(messages: readonly EmailMessage[]): TriageThread[] {
  const pending = messages.filter((m) => m.triageState === "pending")
  const byThread = new Map<string, EmailMessage[]>()
  for (const m of pending) {
    const list = byThread.get(m.threadId) ?? []
    list.push(m)
    byThread.set(m.threadId, list)
  }
  return [...byThread.entries()]
    .map(([threadId, list]) => {
      const latest = list.slice().sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0]!
      const inbound = list.find((m) => m.direction === "inbound") ?? latest
      return {
        threadId,
        senderEmail: inbound.fromEmail,
        senderName: inbound.fromName,
        subject: latest.subject,
        snippet: latest.snippet,
        latestAt: latest.sentAt,
        messageCount: list.length,
      }
    })
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1))
}

export function countTriagePending(messages: readonly EmailMessage[]) {
  return listTriageThreads(messages).length
}

export type CaseFilter = {
  status?: CaseStatus
  priority?: CasePriority
  q?: string
}

export function matchesCase(
  row: Case,
  contact: Contact | undefined,
  org: Organization | null,
  filter: CaseFilter
) {
  if (filter.status && row.status !== filter.status) return false
  if (filter.priority && row.priority !== filter.priority) return false
  const q = filter.q?.trim().toLowerCase()
  if (!q) return true
  const numberHit = q.replace(/^#/, "") === String(row.caseNumber) || `#${row.caseNumber}` === q
  const hay = [
    row.subject,
    contact ? contactDisplayName(contact) : "",
    contact?.email ?? "",
    org?.name ?? "",
    `#${row.caseNumber}`,
  ]
    .join(" ")
    .toLowerCase()
  return numberHit || hay.includes(q)
}

export function filterCases(
  cases: readonly Case[],
  contacts: readonly Contact[],
  organizations: readonly Organization[],
  filter: CaseFilter
) {
  return cases
    .filter((row) => {
      const contact = contactOf(contacts, row.contactId)
      const organization = contact ? orgOf(organizations, contact.organizationId) : null
      return matchesCase(row, contact, organization, filter)
    })
    .sort((a, b) => {
      const at = a.lastActivityAt ?? a.createdAt
      const bt = b.lastActivityAt ?? b.createdAt
      if (at !== bt) return at < bt ? 1 : -1
      return b.caseNumber - a.caseNumber
    })
}

export function matchesContact(
  contact: Contact,
  org: Organization | null,
  q: string | undefined
) {
  const query = q?.trim().toLowerCase()
  if (!query) return true
  const hay = [contactDisplayName(contact), contact.email, org?.name ?? "", contact.plan ?? ""]
    .join(" ")
    .toLowerCase()
  return hay.includes(query)
}

export function filterContacts(
  contacts: readonly Contact[],
  organizations: readonly Organization[],
  q?: string
) {
  return contacts
    .filter((c) => matchesContact(c, orgOf(organizations, c.organizationId), q))
    .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b)))
}

export function searchCrm(
  q: string,
  cases: readonly Case[],
  contacts: readonly Contact[],
  organizations: readonly Organization[]
) {
  const query = q.trim()
  const caseHits = filterCases(cases, contacts, organizations, { q: query }).slice(0, 8)
  const contactHits = filterContacts(contacts, organizations, query).slice(0, 8)
  return { cases: caseHits, contacts: contactHits }
}

export function timelineFor(
  caseId: string,
  messages: readonly EmailMessage[],
  notes: readonly Note[]
) {
  const items: Array<
    | { kind: "message"; at: string; message: EmailMessage }
    | { kind: "note"; at: string; note: Note }
  > = [
    ...messages
      .filter((m) => m.caseId === caseId)
      .map((message) => ({ kind: "message" as const, at: message.sentAt, message })),
    ...notes
      .filter((n) => n.caseId === caseId)
      .map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
  ]
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

export function formatCrmRelative(iso: string | null, nowMs: number) {
  if (!iso) return "—"
  return formatRelative(Date.parse(iso), nowMs)
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatCrmDateTime(iso: string) {
  return DATE_TIME.format(new Date(iso))
}

const clampText = (s: string, max: number) => s.trim().slice(0, max)

export function isWellFormedEmail(email: string) {
  const value = normalizeEmail(email)
  if (!value || value.length > CRM_LIMITS.email) return false
  if (value.indexOf("@") !== value.lastIndexOf("@")) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function newContactEmailError(email: string, existing: readonly string[]): string | null {
  const normalized = normalizeEmail(email)
  if (!isWellFormedEmail(normalized)) return "Enter a valid email address."
  if (existing.some((row) => normalizeEmail(row) === normalized)) {
    return "A contact with this email already exists."
  }
  return null
}

export function normalizeContactInput(input: ContactInput): {
  email: string
  firstName: string | null
  lastName: string | null
  organizationName: string | null
} {
  const email = normalizeEmail(clampText(input.email, CRM_LIMITS.email))
  const first = clampText(input.firstName ?? "", CRM_LIMITS.name) || null
  const last = clampText(input.lastName ?? "", CRM_LIMITS.name) || null
  const org = clampText(input.organizationName ?? "", CRM_LIMITS.org) || null
  return { email, firstName: first, lastName: last, organizationName: org }
}

export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  const domain = email.slice(at + 1).toLowerCase()
  if (!domain || domain === "gmail.com" || domain === "yahoo.com" || domain === "outlook.com") {
    return null
  }
  return domain
}

export function sameContact(a: Contact, b: Contact) {
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.nameSource === b.nameSource &&
    a.organizationId === b.organizationId &&
    a.plan === b.plan &&
    a.planStatus === b.planStatus &&
    a.source === b.source &&
    a.createdAt === b.createdAt
  )
}
