import { desc, inArray, like, or, sql } from "drizzle-orm"

import { contactDisplayName } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"
import { cases, contacts, organizations } from "@/lib/crm/db/schema"

export type SearchResults = {
  cases: {
    id: string
    caseNumber: number
    subject: string
    status: string
    contactName: string
  }[]
  contacts: {
    id: string
    name: string
    email: string
    organization: string | null
  }[]
}

export async function searchAll(db: Db, q: string): Promise<SearchResults> {
  const trimmed = q.trim()
  if (!trimmed) return { cases: [], contacts: [] }
  const pattern = `%${trimmed.toLowerCase()}%`
  const numeric = Number(trimmed.replace(/^#/, ""))
  const caseNumberMatch = Number.isInteger(numeric) && numeric > 0 ? numeric : null

  const matchingContactIds = db
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
    .limit(20)
    .all()
    .map((row) => row.id)

  const caseRows = await db.query.cases.findMany({
    where: or(
      like(sql`lower(${cases.subject})`, pattern),
      caseNumberMatch !== null ? sql`${cases.caseNumber} = ${caseNumberMatch}` : sql`0`,
      matchingContactIds.length > 0
        ? inArray(cases.contactId, matchingContactIds)
        : sql`0`
    ),
    with: { contact: true },
    orderBy: [desc(cases.lastActivityAt)],
    limit: 6,
  })

  const contactRows = db
    .select({ contact: contacts, organization: organizations })
    .from(contacts)
    .leftJoin(organizations, sql`${contacts.organizationId} = ${organizations.id}`)
    .where(
      or(
        like(sql`lower(${contacts.email})`, pattern),
        like(
          sql`lower(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, ''))`,
          pattern
        ),
        like(sql`lower(coalesce(${organizations.name}, ''))`, pattern)
      )
    )
    .limit(6)
    .all()

  return {
    cases: caseRows.map((row) => ({
      id: row.id,
      caseNumber: row.caseNumber,
      subject: row.subject,
      status: row.status,
      contactName: contactDisplayName(row.contact),
    })),
    contacts: contactRows.map((row) => ({
      id: row.contact.id,
      name: contactDisplayName(row.contact),
      email: row.contact.email,
      organization: row.organization?.name ?? null,
    })),
  }
}
