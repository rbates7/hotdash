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
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm"

import { OVERDUE_THRESHOLD_DAYS } from "@/lib/crm/cases/age"
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
import { sinceWindow, type DayWindow, type SortDirection } from "@/lib/crm/list"

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

/**
 * Moves several cases at once, all or none: an unknown id rolls the whole
 * batch back rather than leaving half a selection closed. Each case gets
 * the same system note it would from the status path. Returns how many
 * actually changed; cases already in that status are left alone.
 */
export function setCaseStatusBulk(
  db: Db,
  caseIds: string[],
  status: CaseStatus
): number {
  if (!CASE_STATUSES.includes(status)) {
    throw new ValidationError(`Unknown status "${status}".`)
  }
  const unique = [...new Set(caseIds)]
  const run = rawClient(db).transaction(() => {
    let changed = 0
    for (const caseId of unique) {
      const before = db
        .select({ status: cases.status })
        .from(cases)
        .where(eq(cases.id, caseId))
        .get()
      if (!before) throw new NotFoundError("One of those cases no longer exists.")
      if (before.status === status) continue
      setCaseStatus(db, caseId, status)
      changed += 1
    }
    return changed
  })
  return run()
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


export { DAY_WINDOWS as CASE_WINDOWS } from "@/lib/crm/list"
export type CaseWindow = DayWindow
export type { SortDirection }

export const CASE_AUDIENCES = ["customer", "unknown"] as const
export type CaseAudience = (typeof CASE_AUDIENCES)[number]

export const CASE_SORTS = [
  "activity",
  "number",
  "subject",
  "contact",
  "status",
  "priority",
  "age",
] as const
export type CaseSort = (typeof CASE_SORTS)[number]

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
  /** Waiting on your reply for OVERDUE_THRESHOLD_DAYS or more. */
  overdue?: boolean
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
    case "age": {
      // Oldest first is the useful way round, so "desc" is the biggest age
      // — the earliest anchor — at the top.
      const anchor = ageAnchorSql()
      return [direction === "desc" ? asc(anchor) : desc(anchor), tiebreak]
    }
    default:
      return [dir(cases.lastActivityAt), tiebreak]
  }
}

/**
 * "Needs my reply" is read from the message timestamps rather than from
 * status: a case can be Open with your answer already sitting on it, and a
 * status someone set by hand says nothing about who spoke last.
 */
export function needsReplyCondition() {
  return and(
    isNotNull(cases.lastInboundAt),
    or(
      isNull(cases.lastOutboundAt),
      sql`${cases.lastInboundAt} > ${cases.lastOutboundAt}`
    )
  )
}

/** The moment a case's age counts from: when they last wrote if the ball
 * is with you, else when the case was opened. The same rule in plain code
 * lives in cases/age.ts, which the tests hold this to. */
function ageAnchorSql() {
  return sql`case when ${cases.lastInboundAt} is not null and (${cases.lastOutboundAt} is null or ${cases.lastInboundAt} > ${cases.lastOutboundAt}) then ${cases.lastInboundAt} else ${cases.createdAt} end`
}

/** Waiting on your reply for OVERDUE_THRESHOLD_DAYS or more, and not closed. */
export function overdueCondition(now = Date.now()) {
  return and(
    ne(cases.status, "closed"),
    needsReplyCondition(),
    lte(
      cases.lastInboundAt,
      new Date(now - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000)
    )
  )
}

export function countOverdueCases(db: Db): number {
  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(cases)
      .where(overdueCondition())
      .get()?.count ?? 0
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
  if (filters.overdue) conditions.push(overdueCondition())

  if (filters.window) {
    conditions.push(gte(cases.lastActivityAt, sinceWindow(filters.window)))
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
