import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { countOverdueCases } from "@/lib/crm/cases/server"
import { listContacts } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages, notes } from "@/lib/crm/db/schema"

/** How many names the Overview's new / churned lists show before "View all". */
export const OVERVIEW_LIST_LIMIT = 25

/** The Customers filters behind each Overview list, so "View all" lands on
 * exactly the rows the list was cut from and its pager total matches. */
export const NEW_THIS_WEEK_FILTERS = {
  status: "active",
  started: "7d",
  sort: "date",
  direction: "desc",
} as const
export const CHURNED_THIS_WEEK_FILTERS = {
  standing: "all",
  status: "canceled",
  ended: "7d",
  sort: "date",
  direction: "desc",
} as const

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
    where: and(eq(notes.kind, "user"), isNotNull(notes.caseId)),
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

  // "New" is someone who started paying this week — a trial counts once it
  // converts, dated by the day paying began. "Churned" is a plan that
  // actually stopped this week; a cancellation scheduled for the end of
  // the period is still paying and is not here yet.
  const newThisWeek = await listContacts(db, {
    ...NEW_THIS_WEEK_FILTERS,
    limit: OVERVIEW_LIST_LIMIT,
  })
  const churnedThisWeek = await listContacts(db, {
    ...CHURNED_THIS_WEEK_FILTERS,
    limit: OVERVIEW_LIST_LIMIT,
  })

  return {
    counts,
    urgentOpen: urgentOpen?.count ?? 0,
    overdueCount: countOverdueCases(db),
    oldestUntouched,
    activity,
    contactCount: contactCount?.count ?? 0,
    newThisWeek: { rows: newThisWeek.rows, total: newThisWeek.total },
    churnedThisWeek: {
      rows: churnedThisWeek.rows,
      total: churnedThisWeek.total,
    },
  }
}
