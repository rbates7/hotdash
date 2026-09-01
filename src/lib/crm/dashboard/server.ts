import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import type { Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages, notes } from "@/lib/crm/db/schema"

export async function getDashboardData(db: Db) {
  const statusCounts = db
    .select({ status: cases.status, count: sql<number>`count(*)` })
    .from(cases)
    .groupBy(cases.status)
    .all()
  const counts = { new: 0, open: 0, waiting: 0, closed: 0 }
  for (const row of statusCounts) counts[row.status] = row.count

  const urgentOpen = db
    .select({ count: sql<number>`count(*)` })
    .from(cases)
    .where(
      and(
        inArray(cases.status, ["new", "open", "waiting"]),
        eq(cases.priority, "urgent")
      )
    )
    .get()

  const oldestUntouched = await db.query.cases.findMany({
    where: inArray(cases.status, ["new", "open"]),
    with: { contact: true },
    orderBy: [sql`${cases.lastActivityAt} asc nulls first`],
    limit: 5,
  })

  const recentMessages = await db.query.emailMessages.findMany({
    where: isNotNull(emailMessages.caseId),
    with: { case: { with: { contact: true } } },
    orderBy: [desc(emailMessages.sentAt)],
    limit: 10,
  })

  const recentNotes = await db.query.notes.findMany({
    where: eq(notes.kind, "user"),
    with: { case: { with: { contact: true } } },
    orderBy: [desc(notes.createdAt)],
    limit: 5,
  })

  const activity = [
    ...recentMessages.map((message) => ({
      kind: "message" as const,
      at: message.sentAt,
      message,
    })),
    ...recentNotes.map((note) => ({
      kind: "note" as const,
      at: note.createdAt,
      note,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10)

  const contactCount = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .get()

  return {
    counts,
    urgentOpen: urgentOpen?.count ?? 0,
    oldestUntouched,
    activity,
    contactCount: contactCount?.count ?? 0,
  }
}
