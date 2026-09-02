import { randomUUID } from "node:crypto"

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

import {
  canOverwriteName,
  normalizeEmail,
  type CustomerType,
} from "@/lib/crm/contacts/matching"
import { NotFoundError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import {
  cases,
  contactEmails,
  contacts,
  emailMessages,
  organizations,
  type Contact,
  type NameSource,
} from "@/lib/crm/db/schema"

export function findContactByEmail(db: Db, email: string) {
  const normalized = normalizeEmail(email)
  const direct = db
    .select()
    .from(contacts)
    .where(eq(contacts.email, normalized))
    .get()
  if (direct) return direct
  // Fall back to addresses learned from triage linking.
  const alias = db
    .select()
    .from(contactEmails)
    .where(eq(contactEmails.email, normalized))
    .get()
  if (!alias) return undefined
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.id, alias.contactId))
    .get()
}

/** Teaches the CRM that `email` also belongs to this contact. */
export function addContactEmail(db: Db, contactId: string, email: string) {
  const normalized = normalizeEmail(email)
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get()
  if (!contact || contact.email === normalized) return
  db.insert(contactEmails)
    .values({ email: normalized, contactId, createdAt: new Date() })
    .onConflictDoNothing()
    .run()
}

/**
 * Organizations that no contact points at any more. A sync that unlinks the
 * last member of an account leaves the account behind otherwise, and the
 * Accounts view would keep listing teams with nobody on them.
 */
export function deleteOrphanOrganizations(db: Db): number {
  const linked = db
    .select({ id: contacts.organizationId })
    .from(contacts)
    .where(isNotNull(contacts.organizationId))
  const result = db
    .delete(organizations)
    .where(notInArray(organizations.id, linked))
    .run()
  return result.changes
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
    source: "gmail" | "stripe" | "supabase" | "manual"
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
  // Organization is independent of the name-source contest: a manual name
  // edit must not stop an account link from ever arriving. A hand-made link
  // is never touched. A link this same source made is its own to change or
  // remove — "team" is defined upstream, and when that definition tightens
  // (a typed-in school name is not a staff account), the sync has to be
  // able to take back what it linked under the old one.
  if (contact.organizationSource !== "manual") {
    if (incoming.organizationName) {
      const org = findOrCreateOrganizationByName(db, incoming.organizationName)
      if (org.id !== contact.organizationId) {
        updates.organizationId = org.id
        updates.organizationSource = incoming.source
      }
    } else if (
      contact.organizationId &&
      contact.organizationSource === incoming.source
    ) {
      updates.organizationId = null
      updates.organizationSource = null
    }
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
    /** The school or team they typed into their profile. */
    affiliation?: string | null
  }
): Contact {
  const updates: Partial<typeof contacts.$inferInsert> = {}
  if (incoming.appUserId && incoming.appUserId !== contact.appUserId) {
    updates.appUserId = incoming.appUserId
  }
  const affiliation = incoming.affiliation?.trim()
  if (affiliation && affiliation !== contact.affiliation) {
    updates.affiliation = affiliation
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
    // Marking the link manual is what protects it from every later sync.
    // Changing the *name* source here was a mistake: it also froze names
    // that had never been hand-edited.
    if (input.organizationName) {
      const org = findOrCreateOrganizationByName(db, input.organizationName)
      updates.organizationId = org.id
      updates.organizationSource = "manual"
    } else if (input.organizationName === null) {
      updates.organizationId = null
      updates.organizationSource = "manual"
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
  /** "active" (the default view) hides churned and never-paid contacts. */
  standing?: CustomerStanding
  limit?: number
  offset?: number
}

export const CUSTOMER_STANDINGS = ["active", "all"] as const
export type CustomerStanding = (typeof CUSTOMER_STANDINGS)[number]

// Subscription statuses that mean someone is currently paying you, or is
// about to. past_due is deliberately included: they have not left, their card
// failed, and they are the ones most worth answering quickly.
export const ACTIVE_PLAN_STATUSES = ["active", "trialing", "past_due"] as const

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
  if (filters.standing === "active") {
    conditions.push(inArray(contacts.planStatus, [...ACTIVE_PLAN_STATUSES]))
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
    .orderBy(
      sql`case when ${contacts.firstName} is null or ${contacts.firstName} = '' then 1 else 0 end`,
      asc(contacts.firstName),
      asc(contacts.email)
    )
    .limit(limit)
    .offset(offset)
    .all()

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(where)
    .get()

  // Type counts respect the search term and the active/all toggle, but not
  // the type filter — so the chips keep showing the whole book within the
  // current view while one slice of it is selected. Ignoring standing here
  // would advertise 3,000 individuals above a list of forty.
  const searchOnly = customerConditions({
    q: filters.q,
    standing: filters.standing,
  })
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

  // Standing counts ignore both the type filter and the standing toggle, so
  // the two chips always show what each would give you.
  const qOnly = customerConditions({ q: filters.q })
  const byStanding = db
    .select({
      active: sql<number>`sum(case when ${contacts.planStatus} in ('active','trialing','past_due') then 1 else 0 end)`,
      all: sql<number>`count(*)`,
    })
    .from(contacts)
    .leftJoin(organizations, eq(contacts.organizationId, organizations.id))
    .where(qOnly.length > 0 ? and(...qOnly) : undefined)
    .get()

  return {
    rows: rows.map((row) => ({
      ...row,
      lastInboundAt: row.lastInboundAt ? new Date(row.lastInboundAt) : null,
    })),
    total: totalRow?.count ?? 0,
    standingCounts: {
      active: byStanding?.active ?? 0,
      all: byStanding?.all ?? 0,
    },
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

  const CASE_LIMIT = 100
  const accountCases = db
    .select({ caseRow: cases, contact: contacts })
    .from(cases)
    .innerJoin(contacts, eq(cases.contactId, contacts.id))
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(desc(cases.lastActivityAt))
    .limit(CASE_LIMIT)
    .all()

  // Counts come from aggregates, not from the page of cases above, or a
  // busy account would under-report once it passes the limit.
  const totals = db
    .select({
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${cases.status} != 'closed' then 1 else 0 end)`,
    })
    .from(cases)
    .innerJoin(contacts, eq(cases.contactId, contacts.id))
    .where(eq(contacts.organizationId, organizationId))
    .get()

  return {
    organization,
    staff: staffWithCounts,
    staffCount: staff.length,
    cases: accountCases,
    totalCases: totals?.total ?? 0,
    openCases: totals?.open ?? 0,
    casesTruncated: (totals?.total ?? 0) > CASE_LIMIT,
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
