import { randomUUID } from "node:crypto"

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
  sql,
} from "drizzle-orm"

import { STATUS_LABELS } from "@/lib/crm/cases/labels"
import { transitionOnMessage, type MessageDirection } from "@/lib/crm/cases/rules"
import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import { rawClient, type Db } from "@/lib/crm/db/client"
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  cases,
  contacts,
  notes,
  type Case,
  type CasePriority,
  type CaseStatus,
} from "@/lib/crm/db/schema"

export function nextCaseNumber(db: Db): number {
  const row = rawClient(db)
    .prepare(
      "UPDATE counters SET value = value + 1 WHERE id = 'case' RETURNING value"
    )
    .get() as { value: number } | undefined
  if (!row) throw new Error("Case counter row is missing.")
  return row.value
}

export function addSystemNote(db: Db, caseId: string, body: string, at: Date) {
  db.insert(notes)
    .values({ id: randomUUID(), caseId, kind: "system", body, createdAt: at })
    .run()
}

export function createCaseForThread(
  db: Db,
  input: {
    contactId: string
    subject: string
    gmailThreadId: string | null
    createdAt: Date
  }
): Case {
  const id = randomUUID()
  const caseNumber = nextCaseNumber(db)
  db.insert(cases)
    .values({
      id,
      caseNumber,
      subject: input.subject,
      status: "new",
      priority: "normal",
      contactId: input.contactId,
      gmailThreadId: input.gmailThreadId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .run()
  const created = db.select().from(cases).where(eq(cases.id, id)).get()
  if (!created) throw new Error("Failed to create case.")
  return created
}

// Applies a message's effect on its case: activity timestamps plus the
// status transition. Returns the resulting status.
export function applyMessageToCase(
  db: Db,
  caseRow: Case,
  message: {
    direction: MessageDirection
    sentAt: Date
    fromName: string | null
    fromEmail: string
  }
): CaseStatus {
  const { status, reopened } = transitionOnMessage(
    caseRow.status,
    message.direction
  )
  const isNewer =
    !caseRow.lastActivityAt || message.sentAt > caseRow.lastActivityAt

  db.update(cases)
    .set({
      status,
      closedAt: status === "closed" ? caseRow.closedAt : null,
      lastActivityAt: isNewer ? message.sentAt : caseRow.lastActivityAt,
      lastInboundAt:
        message.direction === "inbound" &&
        (!caseRow.lastInboundAt || message.sentAt > caseRow.lastInboundAt)
          ? message.sentAt
          : caseRow.lastInboundAt,
      lastOutboundAt:
        message.direction === "outbound" &&
        (!caseRow.lastOutboundAt || message.sentAt > caseRow.lastOutboundAt)
          ? message.sentAt
          : caseRow.lastOutboundAt,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseRow.id))
    .run()

  if (reopened) {
    const sender = message.fromName || message.fromEmail
    addSystemNote(
      db,
      caseRow.id,
      `Reopened by email from ${sender}`,
      message.sentAt
    )
  }
  return status
}

export function setCaseStatus(db: Db, caseId: string, status: CaseStatus) {
  if (!CASE_STATUSES.includes(status)) {
    throw new ValidationError(`Unknown status "${status}".`)
  }
  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseRow) throw new NotFoundError("Case not found.")
  if (caseRow.status === status) return caseRow
  const now = new Date()
  db.update(cases)
    .set({
      status,
      closedAt: status === "closed" ? now : null,
      updatedAt: now,
    })
    .where(eq(cases.id, caseId))
    .run()
  addSystemNote(db, caseId, `Status changed to ${STATUS_LABELS[status]}`, now)
  return db.select().from(cases).where(eq(cases.id, caseId)).get()!
}

export function setCasePriority(
  db: Db,
  caseId: string,
  priority: CasePriority
) {
  if (!CASE_PRIORITIES.includes(priority)) {
    throw new ValidationError(`Unknown priority "${priority}".`)
  }
  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseRow) throw new NotFoundError("Case not found.")
  if (caseRow.priority === priority) return caseRow
  db.update(cases)
    .set({ priority, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .run()
  return db.select().from(cases).where(eq(cases.id, caseId)).get()!
}


/** Windows offered by the date filter, in days back from now. */
export const CASE_WINDOWS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const
export type CaseWindow = keyof typeof CASE_WINDOWS

export const CASE_AUDIENCES = ["customer", "unknown"] as const
export type CaseAudience = (typeof CASE_AUDIENCES)[number]

export const CASE_SORTS = [
  "activity",
  "number",
  "subject",
  "contact",
  "status",
  "priority",
] as const
export type CaseSort = (typeof CASE_SORTS)[number]
export type SortDirection = "asc" | "desc"

export type CaseListFilters = {
  status?: CaseStatus
  priority?: CasePriority
  q?: string
  /** Only cases whose newest message is inbound — i.e. the ball is with you. */
  needsReply?: boolean
  /** Last activity within this many days. */
  window?: CaseWindow
  /** Whether the contact is a paying Stripe customer. */
  audience?: CaseAudience
  sort?: CaseSort
  direction?: SortDirection
  limit?: number
  offset?: number
}

export const CASES_PER_PAGE = 50

/**
 * Column ordering. Status and priority sort by their workflow order rather
 * than alphabetically — "closed, new, open, waiting" tells you nothing, while
 * new → open → waiting → closed is the actual progression.
 */
function orderFor(sort: CaseSort | undefined, direction: SortDirection = "desc") {
  const dir = direction === "asc" ? asc : desc
  const tiebreak = desc(cases.createdAt)
  switch (sort) {
    case "number":
      return [dir(cases.caseNumber)]
    case "subject":
      return [dir(sql`lower(${cases.subject})`), tiebreak]
    case "contact":
      return [
        dir(sql`(select lower(coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), c.email)) from contacts c where c.id = ${cases.contactId})`),
        tiebreak,
      ]
    case "status":
      return [
        dir(sql`case ${cases.status} when 'new' then 0 when 'open' then 1 when 'waiting' then 2 else 3 end`),
        tiebreak,
      ]
    case "priority":
      return [
        dir(sql`case ${cases.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`),
        tiebreak,
      ]
    default:
      return [dir(cases.lastActivityAt), tiebreak]
  }
}

/**
 * "Needs my reply" is read from the message timestamps rather than from
 * status: a case can be Open with your answer already sitting on it, and a
 * status someone set by hand says nothing about who spoke last.
 */
function needsReplyCondition() {
  return and(
    isNotNull(cases.lastInboundAt),
    or(
      isNull(cases.lastOutboundAt),
      sql`${cases.lastInboundAt} > ${cases.lastOutboundAt}`
    )
  )
}

/** One page of cases plus the total for the pager. Cases accumulate for as
 * long as the CRM runs, so this must never select the whole table. */
export async function listCases(db: Db, filters: CaseListFilters = {}) {
  const conditions = []
  if (filters.status) conditions.push(eq(cases.status, filters.status))
  if (filters.priority) conditions.push(eq(cases.priority, filters.priority))
  if (filters.q) {
    const pattern = `%${filters.q.toLowerCase()}%`
    // Contact matches go in as a subquery rather than by loading every
    // matching id and binding them all: with thousands of customers that
    // defeats the pagination below and risks the bound-parameter cap.
    // (A raw correlated EXISTS is not an option here — inside the relational
    // query builder, interpolated columns get rewritten to the root alias.)
    const matchingContacts = db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        or(
          like(sql`lower(${contacts.email})`, pattern),
          like(
            sql`lower(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, ''))`,
            pattern
          )
        )
      )
    conditions.push(
      or(
        like(sql`lower(${cases.subject})`, pattern),
        inArray(cases.contactId, matchingContacts)
      )
    )
  }

  if (filters.needsReply) conditions.push(needsReplyCondition())

  if (filters.window) {
    const since = new Date(
      Date.now() - CASE_WINDOWS[filters.window] * 24 * 60 * 60 * 1000
    )
    conditions.push(gte(cases.lastActivityAt, since))
  }

  if (filters.audience) {
    // Same subquery shape as the search above, and for the same reason:
    // thousands of customers must not become thousands of bound parameters.
    const matching = db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        filters.audience === "customer"
          ? isNotNull(contacts.stripeCustomerId)
          : isNull(contacts.stripeCustomerId)
      )
    conditions.push(inArray(cases.contactId, matching))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const limit = filters.limit ?? CASES_PER_PAGE
  const offset = filters.offset ?? 0

  const rows = await db.query.cases.findMany({
    where,
    with: { contact: { with: { organization: true } } },
    orderBy: orderFor(filters.sort, filters.direction),
    limit,
    offset,
  })

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(cases)
    .where(where)
    .get()

  return { rows, total: totalRow?.count ?? 0, limit, offset }
}

export async function getCaseWithTimeline(db: Db, caseId: string) {
  const caseRow = await db.query.cases.findFirst({
    where: eq(cases.id, caseId),
    with: {
      contact: { with: { organization: true } },
      messages: true,
      notes: true,
    },
  })
  if (!caseRow) throw new NotFoundError("Case not found.")
  return caseRow
}

export function getCaseByThreadId(db: Db, gmailThreadId: string) {
  return db
    .select()
    .from(cases)
    .where(eq(cases.gmailThreadId, gmailThreadId))
    .get()
}
