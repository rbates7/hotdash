import { randomUUID } from "node:crypto"

import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm"

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


export type CaseListFilters = {
  status?: CaseStatus
  priority?: CasePriority
  q?: string
}

export async function listCases(db: Db, filters: CaseListFilters = {}) {
  const conditions = []
  if (filters.status) conditions.push(eq(cases.status, filters.status))
  if (filters.priority) conditions.push(eq(cases.priority, filters.priority))
  if (filters.q) {
    const pattern = `%${filters.q.toLowerCase()}%`
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
      .all()
    conditions.push(
      or(
        like(sql`lower(${cases.subject})`, pattern),
        matchingContacts.length > 0
          ? inArray(
              cases.contactId,
              matchingContacts.map((c) => c.id)
            )
          : sql`0`
      )
    )
  }

  return db.query.cases.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: { contact: { with: { organization: true } } },
    orderBy: [desc(cases.lastActivityAt), desc(cases.createdAt)],
  })
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
