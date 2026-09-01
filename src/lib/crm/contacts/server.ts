import { randomUUID } from "node:crypto"

import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, sql } from "drizzle-orm"

import {
  canOverwriteName,
  normalizeEmail,
  type CustomerType,
} from "@/lib/crm/contacts/matching"
import { NotFoundError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import {
  cases,
  contacts,
  emailMessages,
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

/** Mirrors product-usage fields from the Chlk app database. Unlike names,
 * these have no competing source, so incoming values always win; a field
 * the mapping doesn't select is left untouched rather than blanked. */
export function updateContactUsage(
  db: Db,
  contact: Contact,
  incoming: {
    appUserId?: string | null
    signupAt?: Date | null
    lastActiveAt?: Date | null
    appProfile?: Record<string, string | number | boolean | null> | null
  }
): Contact {
  const updates: Partial<typeof contacts.$inferInsert> = {}
  if (incoming.appUserId && incoming.appUserId !== contact.appUserId) {
    updates.appUserId = incoming.appUserId
  }
  if (
    incoming.signupAt &&
    incoming.signupAt.getTime() !== contact.signupAt?.getTime()
  ) {
    updates.signupAt = incoming.signupAt
  }
  if (
    incoming.lastActiveAt &&
    incoming.lastActiveAt.getTime() !== contact.lastActiveAt?.getTime()
  ) {
    updates.lastActiveAt = incoming.lastActiveAt
  }
  if (
    incoming.appProfile &&
    JSON.stringify(incoming.appProfile) !== JSON.stringify(contact.appProfile)
  ) {
    updates.appProfile = incoming.appProfile
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

export type CustomerListFilters = {
  q?: string
  type?: CustomerType
  limit?: number
  offset?: number
}

export const CUSTOMERS_PER_PAGE = 50

/** Shared WHERE for the customer list and its counts, so the pager totals
 * can never disagree with the rows on screen. */
function customerConditions(filters: CustomerListFilters) {
  const conditions = []
  if (filters.q) {
    const pattern = `%${filters.q.toLowerCase()}%`
    conditions.push(
      or(
        like(sql`lower(${contacts.email})`, pattern),
        like(
          sql`lower(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, ''))`,
          pattern
        ),
        like(sql`lower(coalesce(${organizations.name}, ''))`, pattern)
      )
    )
  }
  if (filters.type === "individual") {
    conditions.push(isNull(contacts.organizationId))
  } else if (filters.type === "team") {
    conditions.push(isNotNull(contacts.organizationId))
  }
  return conditions
}

/**
 * One page of customers plus the totals the UI needs. Counts come from SQL
 * rather than from loading every row — the book runs to thousands of
 * individuals, so the list must never fetch the whole table.
 */
export async function listContacts(db: Db, filters: CustomerListFilters = {}) {
  const limit = filters.limit ?? CUSTOMERS_PER_PAGE
  const offset = filters.offset ?? 0

  const openCounts = db
    .select({
      contactId: cases.contactId,
      count: sql<number>`count(*)`.as("open_count"),
    })
    .from(cases)
    .where(sql`${cases.status} != 'closed'`)
    .groupBy(cases.contactId)
    .as("open_counts")

  const lastInbound = db
    .select({
      contactId: cases.contactId,
      at: sql<number>`max(${emailMessages.sentAt})`.as("last_inbound_at"),
    })
    .from(emailMessages)
    .innerJoin(cases, eq(emailMessages.caseId, cases.id))
    .where(eq(emailMessages.direction, "inbound"))
    .groupBy(cases.contactId)
    .as("last_inbound")

  const conditions = customerConditions(filters)
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = db
    .select({
      contact: contacts,
      organization: organizations,
      openCases: sql<number>`coalesce(${openCounts.count}, 0)`,
      lastInboundAt: sql<number | null>`${lastInbound.at}`,
    })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .leftJoin(openCounts, eq(openCounts.contactId, contacts.id))
    .leftJoin(lastInbound, eq(lastInbound.contactId, contacts.id))
    .where(where)
    .orderBy(asc(contacts.firstName), asc(contacts.email))
    .limit(limit)
    .offset(offset)
    .all()

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(where)
    .get()

  // Type counts respect the search term but not the type filter, so the
  // chips keep showing the whole book while one slice is selected.
  const searchOnly = customerConditions({ q: filters.q })
  const searchWhere = searchOnly.length > 0 ? and(...searchOnly) : undefined
  const byType = db
    .select({
      individual: sql<number>`sum(case when ${contacts.organizationId} is null then 1 else 0 end)`,
      team: sql<number>`sum(case when ${contacts.organizationId} is not null then 1 else 0 end)`,
      all: sql<number>`count(*)`,
    })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(searchWhere)
    .get()

  return {
    rows: rows.map((row) => ({
      ...row,
      lastInboundAt: row.lastInboundAt ? new Date(row.lastInboundAt) : null,
    })),
    total: totalRow?.count ?? 0,
    counts: {
      all: byType?.all ?? 0,
      individual: byType?.individual ?? 0,
      team: byType?.team ?? 0,
    },
    limit,
    offset,
  }
}

export type AccountListFilters = { q?: string; limit?: number; offset?: number }

export const ACCOUNTS_PER_PAGE = 50

/**
 * One page of B2B accounts with their rollups. Every figure is a SQL
 * aggregate — with organizations in the hundreds, per-row follow-up
 * queries would turn this page into hundreds of round trips.
 */
export async function listOrganizations(
  db: Db,
  filters: AccountListFilters = {}
) {
  const limit = filters.limit ?? ACCOUNTS_PER_PAGE
  const offset = filters.offset ?? 0
  const where = filters.q
    ? like(sql`lower(${organizations.name})`, `%${filters.q.toLowerCase()}%`)
    : undefined

  const staff = db
    .select({
      organizationId: contacts.organizationId,
      count: sql<number>`count(*)`.as("staff_count"),
      plans: sql<string | null>`group_concat(distinct ${contacts.plan})`.as(
        "plans"
      ),
    })
    .from(contacts)
    .where(isNotNull(contacts.organizationId))
    .groupBy(contacts.organizationId)
    .as("staff")

  const caseStats = db
    .select({
      organizationId: contacts.organizationId,
      openCases: sql<number>`sum(case when ${cases.status} != 'closed' then 1 else 0 end)`.as(
        "open_cases"
      ),
      lastActivityAt: sql<number>`max(${cases.lastActivityAt})`.as(
        "last_activity_at"
      ),
    })
    .from(cases)
    .innerJoin(contacts, eq(cases.contactId, contacts.id))
    .where(isNotNull(contacts.organizationId))
    .groupBy(contacts.organizationId)
    .as("case_stats")

  const rows = db
    .select({
      organization: organizations,
      staffCount: sql<number>`coalesce(${staff.count}, 0)`,
      plans: sql<string | null>`${staff.plans}`,
      openCases: sql<number>`coalesce(${caseStats.openCases}, 0)`,
      lastActivityAt: sql<number | null>`${caseStats.lastActivityAt}`,
    })
    .from(organizations)
    .leftJoin(staff, eq(staff.organizationId, organizations.id))
    .leftJoin(caseStats, eq(caseStats.organizationId, organizations.id))
    .where(where)
    .orderBy(asc(organizations.name))
    .limit(limit)
    .offset(offset)
    .all()

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(organizations)
    .where(where)
    .get()

  return {
    rows: rows.map((row) => ({
      ...row,
      plans: row.plans ? row.plans.split(",").filter(Boolean).sort() : [],
      lastActivityAt: row.lastActivityAt
        ? new Date(row.lastActivityAt)
        : null,
    })),
    total: totalRow?.count ?? 0,
    limit,
    offset,
  }
}

/** An account with its staff and every case across it. */
export async function getOrganizationWithStaff(db: Db, organizationId: string) {
  const organization = db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .get()
  if (!organization) throw new NotFoundError("Account not found.")

  const staff = db
    .select({ contact: contacts })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(asc(contacts.firstName), asc(contacts.email))
    .all()

  const openCounts = db
    .select({
      contactId: cases.contactId,
      count: sql<number>`count(*)`.as("open_count"),
    })
    .from(cases)
    .where(sql`${cases.status} != 'closed'`)
    .groupBy(cases.contactId)
    .as("open_counts")

  const staffWithCounts = db
    .select({
      contact: contacts,
      openCases: sql<number>`coalesce(${openCounts.count}, 0)`,
    })
    .from(contacts)
    .leftJoin(openCounts, eq(openCounts.contactId, contacts.id))
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(asc(contacts.firstName), asc(contacts.email))
    .all()

  const accountCases = db
    .select({ caseRow: cases, contact: contacts })
    .from(cases)
    .innerJoin(contacts, eq(cases.contactId, contacts.id))
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(desc(cases.lastActivityAt))
    .limit(100)
    .all()

  return {
    organization,
    staff: staffWithCounts,
    staffCount: staff.length,
    cases: accountCases,
  }
}

/** Everyone else on a B2B customer's account, for the teammates rollup. */
export function listTeammates(
  db: Db,
  organizationId: string,
  excludeContactId: string
) {
  const openCounts = db
    .select({
      contactId: cases.contactId,
      count: sql<number>`count(*)`.as("open_count"),
    })
    .from(cases)
    .where(sql`${cases.status} != 'closed'`)
    .groupBy(cases.contactId)
    .as("open_counts")

  return db
    .select({
      contact: contacts,
      openCases: sql<number>`coalesce(${openCounts.count}, 0)`,
    })
    .from(contacts)
    .leftJoin(openCounts, eq(openCounts.contactId, contacts.id))
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        ne(contacts.id, excludeContactId)
      )
    )
    .orderBy(asc(contacts.firstName), asc(contacts.email))
    .all()
}

export async function getContactWithCases(db: Db, contactId: string) {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    with: {
      organization: true,
      cases: {
        orderBy: [desc(cases.lastActivityAt)],
        with: { messages: { orderBy: [asc(emailMessages.sentAt)] } },
      },
    },
  })
  if (!contact) throw new NotFoundError("Contact not found.")
  return contact
}
