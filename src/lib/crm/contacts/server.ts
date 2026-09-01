import { randomUUID } from "node:crypto"

import { asc, desc, eq, like, or, sql } from "drizzle-orm"

import { canOverwriteName, normalizeEmail } from "@/lib/crm/contacts/matching"
import { NotFoundError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import {
  cases,
  contacts,
  organizations,
  type Contact,
  type NameSource,
} from "@/lib/crm/db/schema"

export function findContactByEmail(db: Db, email: string) {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.email, normalizeEmail(email)))
    .get()
}

export function findOrCreateOrganizationByName(
  db: Db,
  name: string,
  domain?: string | null
) {
  const trimmed = name.trim()
  const existing = db
    .select()
    .from(organizations)
    .where(eq(organizations.name, trimmed))
    .get()
  if (existing) return existing
  const now = new Date()
  const id = randomUUID()
  db.insert(organizations)
    .values({ id, name: trimmed, domain: domain ?? null, createdAt: now, updatedAt: now })
    .run()
  return db.select().from(organizations).where(eq(organizations.id, id)).get()!
}

export function createContact(
  db: Db,
  input: {
    email: string
    firstName?: string | null
    lastName?: string | null
    nameSource?: NameSource | null
    organizationId?: string | null
    stripeCustomerId?: string | null
    plan?: string | null
    planStatus?: string | null
    source: "gmail" | "stripe" | "manual"
  }
): Contact {
  const now = new Date()
  const id = randomUUID()
  db.insert(contacts)
    .values({
      id,
      email: normalizeEmail(input.email),
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      nameSource:
        input.firstName || input.lastName ? (input.nameSource ?? null) : null,
      organizationId: input.organizationId ?? null,
      stripeCustomerId: input.stripeCustomerId ?? null,
      plan: input.plan ?? null,
      planStatus: input.planStatus ?? null,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return db.select().from(contacts).where(eq(contacts.id, id)).get()!
}

// Enrichment path shared by the Stripe/Supabase syncs and triage promotion:
// updates name/org only when the incoming source outranks the stored one.
export function enrichContactName(
  db: Db,
  contact: Contact,
  incoming: {
    firstName?: string | null
    lastName?: string | null
    organizationName?: string | null
    source: NameSource
  }
): Contact {
  const updates: Partial<typeof contacts.$inferInsert> = {}
  const hasName = Boolean(incoming.firstName || incoming.lastName)
  if (hasName && canOverwriteName(contact.nameSource, incoming.source)) {
    updates.firstName = incoming.firstName ?? null
    updates.lastName = incoming.lastName ?? null
    updates.nameSource = incoming.source
  }
  if (
    incoming.organizationName &&
    canOverwriteName(contact.nameSource, incoming.source)
  ) {
    const org = findOrCreateOrganizationByName(db, incoming.organizationName)
    updates.organizationId = org.id
  }
  if (Object.keys(updates).length === 0) return contact
  updates.updatedAt = new Date()
  db.update(contacts).set(updates).where(eq(contacts.id, contact.id)).run()
  return db.select().from(contacts).where(eq(contacts.id, contact.id)).get()!
}

export function updateContactManual(
  db: Db,
  contactId: string,
  input: {
    firstName?: string | null
    lastName?: string | null
    organizationName?: string | null
  }
): Contact {
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get()
  if (!contact) throw new NotFoundError("Contact not found.")
  const updates: Partial<typeof contacts.$inferInsert> = {
    updatedAt: new Date(),
  }
  if ("firstName" in input || "lastName" in input) {
    updates.firstName = input.firstName ?? null
    updates.lastName = input.lastName ?? null
    updates.nameSource = "manual"
  }
  if ("organizationName" in input) {
    if (input.organizationName) {
      const org = findOrCreateOrganizationByName(db, input.organizationName)
      updates.organizationId = org.id
      updates.nameSource = "manual"
    } else if (input.organizationName === null) {
      updates.organizationId = null
      updates.nameSource = "manual"
    }
  }
  db.update(contacts).set(updates).where(eq(contacts.id, contactId)).run()
  return db.select().from(contacts).where(eq(contacts.id, contactId)).get()!
}

export function contactDisplayName(contact: {
  firstName: string | null
  lastName: string | null
  email: string
}): string {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  return name || contact.email
}

export async function listContacts(db: Db, filters: { q?: string } = {}) {
  const openCounts = db
    .select({
      contactId: cases.contactId,
      count: sql<number>`count(*)`.as("open_count"),
    })
    .from(cases)
    .where(sql`${cases.status} != 'closed'`)
    .groupBy(cases.contactId)
    .as("open_counts")

  const pattern = filters.q ? `%${filters.q.toLowerCase()}%` : null
  const rows = db
    .select({
      contact: contacts,
      organization: organizations,
      openCases: sql<number>`coalesce(${openCounts.count}, 0)`,
    })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .leftJoin(openCounts, eq(openCounts.contactId, contacts.id))
    .where(
      pattern
        ? or(
            like(sql`lower(${contacts.email})`, pattern),
            like(
              sql`lower(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, ''))`,
              pattern
            ),
            like(sql`lower(coalesce(${organizations.name}, ''))`, pattern)
          )
        : undefined
    )
    .orderBy(asc(contacts.firstName), asc(contacts.email))
    .all()
  return rows
}

export async function getContactWithCases(db: Db, contactId: string) {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      organization: true,
      cases: { orderBy: [desc(cases.lastActivityAt)] },
    },
  })
  if (!contact) throw new NotFoundError("Contact not found.")
  return contact
}
