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

export async function findContactByEmail(db: Db, email: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, normalizeEmail(email)))
    .limit(1)
  return row
}

export async function findOrCreateOrganizationByName(
  db: Db,
  name: string,
  domain?: string | null
) {
  const trimmed = name.trim()
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, trimmed))
    .limit(1)
  if (existing) return existing
  const now = new Date()
  const id = randomUUID()
  const [created] = await db.insert(organizations)
    .values({ id, name: trimmed, domain: domain ?? null, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: organizations.name })
    .returning()
  if (created) return created
  const [concurrent] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, trimmed))
    .limit(1)
  return concurrent!
}

export async function createContact(
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
): Promise<Contact> {
  const now = new Date()
  const id = randomUUID()
  const [created] = await db.insert(contacts)
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
    .returning()
  if (!created) throw new Error("Failed to create contact.")
  return created
}

// Enrichment path shared by the Stripe/Supabase syncs and triage promotion:
// updates name/org only when the incoming source outranks the stored one.
export async function enrichContactName(
  db: Db,
  contact: Contact,
  incoming: {
    firstName?: string | null
    lastName?: string | null
    organizationName?: string | null
    source: NameSource
  }
): Promise<Contact> {
  return db.transaction(async (tx) => {
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
      const org = await findOrCreateOrganizationByName(
        tx,
        incoming.organizationName
      )
      updates.organizationId = org.id
    }
    if (Object.keys(updates).length === 0) return contact
    updates.updatedAt = new Date()
    const [updated] = await tx
      .update(contacts)
      .set(updates)
      .where(eq(contacts.id, contact.id))
      .returning()
    return updated!
  })
}

export async function updateContactManual(
  db: Db,
  contactId: string,
  input: {
    firstName?: string | null
    lastName?: string | null
    organizationName?: string | null
  }
): Promise<Contact> {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)
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
        const org = await findOrCreateOrganizationByName(
          tx,
          input.organizationName
        )
        updates.organizationId = org.id
        updates.nameSource = "manual"
      } else if (input.organizationName === null) {
        updates.organizationId = null
        updates.nameSource = "manual"
      }
    }
    const [updated] = await tx
      .update(contacts)
      .set(updates)
      .where(eq(contacts.id, contactId))
      .returning()
    return updated!
  })
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
      count: sql<number>`count(*)`.mapWith(Number).as("open_count"),
    })
    .from(cases)
    .where(sql`${cases.status} != 'closed'`)
    .groupBy(cases.contactId)
    .as("open_counts")

  const pattern = filters.q ? `%${filters.q.toLowerCase()}%` : null
  const rows = await db
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
