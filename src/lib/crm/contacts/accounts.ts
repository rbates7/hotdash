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
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"

import type { Db } from "@/lib/crm/db/client"
import { cases, contacts, organizations } from "@/lib/crm/db/schema"
import type { SortDirection } from "@/lib/crm/list"

/**
 * Two kinds of account share the Accounts page.
 *
 *   staff        a Chlk staff account: an organization in the CRM, linked
 *                from staff seats or set up by hand.
 *   prospective  coaches with no staff account who typed the same school
 *                into their profile. Two or more at one school is a team
 *                that has not bought the staff plan yet — the people to
 *                call about one.
 */
export const ACCOUNT_VIEWS = ["staff", "prospective"] as const
export type AccountView = (typeof ACCOUNT_VIEWS)[number]

/** What a row is, for the complete list where the two kinds sit together. */
export const ACCOUNT_KINDS = ["staff", "prospective"] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

export const ACCOUNT_SORTS = ["name", "coaches", "activity", "open"] as const
export type AccountSort = (typeof ACCOUNT_SORTS)[number]

/** How many coaches must have typed the same school for it to count. */
export const PROSPECT_MIN_COACHES = 2

export const ACCOUNTS_PER_PAGE = 50

/** How many schools the complete list loads. Seven show at a time and the
 * rest scroll in place; past this the heading says what is not shown. */
export const ALL_ACCOUNTS_LIMIT = 500

export type AccountListFilters = {
  q?: string
  view?: AccountView
  /** A plan at least one coach on the account is on. */
  plan?: string
  /** At least this many coaches. */
  minCoaches?: number
  hasOpenCase?: boolean
  sort?: AccountSort
  direction?: SortDirection
  limit?: number
  offset?: number
}

/** One row of either view. Both shapes are the same so the page is one. */
export type AccountRow = {
  id: string
  kind: AccountKind
  /** Where the row goes: the account page, or Customers narrowed to the school. */
  href: string
  name: string
  domain: string | null
  staffCount: number
  plans: string[]
  openCases: number
  lastActivityAt: Date | null
}

/** Where a column lands on its first click: names A–Z, counts biggest first. */
const DEFAULT_DIRECTIONS: Record<AccountSort, SortDirection> = {
  name: "asc",
  coaches: "desc",
  activity: "desc",
  open: "desc",
}

function nullsLast(expr: SQLWrapper) {
  return sql`case when ${expr} is null then 1 else 0 end`
}

function splitPlans(plans: string | null) {
  return plans ? plans.split(",").filter(Boolean).sort() : []
}

type SortColumns = {
  name: SQLWrapper
  coaches: SQLWrapper
  activity: SQLWrapper
  open: SQLWrapper
}

/** Ordering shared by both views; each hands over its own columns. */
function orderFor(
  sort: AccountSort,
  direction: SortDirection,
  columns: SortColumns
): SQL[] {
  const dir = direction === "asc" ? asc : desc
  const byName = sql`lower(${columns.name})`
  switch (sort) {
    case "coaches":
      return [dir(columns.coaches), asc(byName)]
    case "activity":
      return [nullsLast(columns.activity), dir(columns.activity), asc(byName)]
    case "open":
      return [dir(columns.open), asc(byName)]
    default:
      return [dir(byName)]
  }
}

type AccountsQuery = {
  columns: SortColumns
  rows(limit: number, offset: number, orderBy: SQL[]): AccountRow[]
  total(): number
}

/**
 * Staff accounts with their rollups. Every figure is a SQL aggregate — with
 * organizations in the hundreds, per-row follow-up queries would turn this
 * page into hundreds of round trips — and the filters that read those
 * aggregates apply to the total too, so the pager stays honest.
 */
function staffAccounts(db: Db, filters: AccountListFilters): AccountsQuery {
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
      openCases: sql<number>`sum(case when ${cases.status} in ('new', 'open') then 1 else 0 end)`.as(
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

  const coaches = sql<number>`coalesce(${staff.count}, 0)`
  const open = sql<number>`coalesce(${caseStats.openCases}, 0)`

  const conditions = []
  if (filters.q) {
    conditions.push(
      like(sql`lower(${organizations.name})`, `%${filters.q.toLowerCase()}%`)
    )
  }
  if (filters.plan) {
    // A subquery, never a list of ids, for the same reason as everywhere
    // else in this module: bound parameters are capped.
    const onPlan = db
      .select({ id: contacts.organizationId })
      .from(contacts)
      .where(
        and(isNotNull(contacts.organizationId), eq(contacts.plan, filters.plan))
      )
    conditions.push(inArray(organizations.id, onPlan))
  }
  if (filters.minCoaches) conditions.push(gte(coaches, filters.minCoaches))
  if (filters.hasOpenCase) conditions.push(sql`${open} > 0`)
  const where = conditions.length > 0 ? and(...conditions) : undefined

  return {
    columns: {
      name: organizations.name,
      coaches,
      activity: caseStats.lastActivityAt,
      open,
    },
    rows(limit, offset, orderBy) {
      return db
        .select({
          organization: organizations,
          staffCount: coaches,
          plans: sql<string | null>`${staff.plans}`,
          openCases: open,
          lastActivityAt: sql<number | null>`${caseStats.lastActivityAt}`,
        })
        .from(organizations)
        .leftJoin(staff, eq(staff.organizationId, organizations.id))
        .leftJoin(caseStats, eq(caseStats.organizationId, organizations.id))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
        .all()
        .map((row) => ({
          id: row.organization.id,
          kind: "staff" as const,
          href: `/crm/accounts/${row.organization.id}`,
          name: row.organization.name,
          domain: row.organization.domain,
          staffCount: row.staffCount,
          plans: splitPlans(row.plans),
          openCases: row.openCases,
          lastActivityAt: row.lastActivityAt
            ? new Date(row.lastActivityAt)
            : null,
        }))
    },
    total() {
      return (
        db
          .select({ count: sql<number>`count(*)` })
          .from(organizations)
          .leftJoin(staff, eq(staff.organizationId, organizations.id))
          .leftJoin(caseStats, eq(caseStats.organizationId, organizations.id))
          .where(where)
          .get()?.count ?? 0
      )
    },
  }
}

/**
 * Prospective accounts: the school name is the key, matched ignoring case
 * and outer spaces, over coaches who are not on any staff account. The
 * displayed name is the first spelling in sort order, which favours a
 * capitalised one. Clicking through lands on exactly those coaches.
 */
function prospectiveAccounts(
  db: Db,
  filters: AccountListFilters,
  minCoaches: number = PROSPECT_MIN_COACHES
): AccountsQuery {
  const key = sql<string>`lower(trim(${contacts.affiliation}))`
  const typedIn = and(
    isNull(contacts.organizationId),
    isNotNull(contacts.affiliation),
    sql`trim(${contacts.affiliation}) <> ''`
  )

  const prospects = db
    .select({
      key: key.as("prospect_key"),
      name: sql<string>`min(trim(${contacts.affiliation}))`.as("name"),
      count: sql<number>`count(*)`.as("staff_count"),
      plans: sql<string | null>`group_concat(distinct ${contacts.plan})`.as(
        "plans"
      ),
    })
    .from(contacts)
    .where(typedIn)
    .groupBy(key)
    .having(sql`count(*) >= ${minCoaches}`)
    .as("prospects")

  const caseStats = db
    .select({
      key: key.as("case_key"),
      openCases: sql<number>`sum(case when ${cases.status} in ('new', 'open') then 1 else 0 end)`.as(
        "open_cases"
      ),
      lastActivityAt: sql<number>`max(${cases.lastActivityAt})`.as(
        "last_activity_at"
      ),
    })
    .from(cases)
    .innerJoin(contacts, eq(cases.contactId, contacts.id))
    .where(typedIn)
    .groupBy(key)
    .as("case_stats")

  const open = sql<number>`coalesce(${caseStats.openCases}, 0)`

  const conditions = []
  if (filters.q) {
    conditions.push(
      like(sql`lower(${prospects.name})`, `%${filters.q.toLowerCase()}%`)
    )
  }
  if (filters.plan) {
    const onPlan = db
      .select({ key })
      .from(contacts)
      .where(and(typedIn, eq(contacts.plan, filters.plan)))
    conditions.push(inArray(prospects.key, onPlan))
  }
  if (filters.minCoaches) {
    conditions.push(gte(prospects.count, filters.minCoaches))
  }
  if (filters.hasOpenCase) conditions.push(sql`${open} > 0`)
  const where = conditions.length > 0 ? and(...conditions) : undefined

  return {
    columns: {
      name: prospects.name,
      coaches: prospects.count,
      activity: caseStats.lastActivityAt,
      open,
    },
    rows(limit, offset, orderBy) {
      return db
        .select({
          key: prospects.key,
          name: prospects.name,
          staffCount: prospects.count,
          plans: prospects.plans,
          openCases: open,
          lastActivityAt: sql<number | null>`${caseStats.lastActivityAt}`,
        })
        .from(prospects)
        .leftJoin(caseStats, eq(caseStats.key, prospects.key))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
        .all()
        .map((row) => ({
          id: row.key,
          kind: "prospective" as const,
          href: `/crm/customers?affiliation=${encodeURIComponent(row.name)}&standing=all&type=individual`,
          name: row.name,
          domain: null,
          staffCount: row.staffCount,
          plans: splitPlans(row.plans),
          openCases: row.openCases,
          lastActivityAt: row.lastActivityAt
            ? new Date(row.lastActivityAt)
            : null,
        }))
    },
    total() {
      return (
        db
          .select({ count: sql<number>`count(*)` })
          .from(prospects)
          .leftJoin(caseStats, eq(caseStats.key, prospects.key))
          .where(where)
          .get()?.count ?? 0
      )
    },
  }
}

function queryFor(db: Db, filters: AccountListFilters, view: AccountView) {
  return view === "prospective"
    ? prospectiveAccounts(db, filters)
    : staffAccounts(db, filters)
}

/** How many accounts each view would show under the current filters. */
export function countAccountViews(db: Db, filters: AccountListFilters = {}) {
  return {
    staff: staffAccounts(db, filters).total(),
    prospective: prospectiveAccounts(db, filters).total(),
  }
}

/** One page of accounts in the chosen view, plus the totals the UI needs. */
export async function listAccounts(db: Db, filters: AccountListFilters = {}) {
  const view = filters.view ?? "staff"
  const limit = filters.limit ?? ACCOUNTS_PER_PAGE
  const offset = filters.offset ?? 0
  const sort = filters.sort ?? "name"
  const direction = filters.direction ?? DEFAULT_DIRECTIONS[sort]
  const query = queryFor(db, filters, view)
  return {
    view,
    rows: query.rows(limit, offset, orderFor(sort, direction, query.columns)),
    total: query.total(),
    viewCounts: countAccountViews(db, filters),
    limit,
    offset,
  }
}

/**
 * The same ordering as `orderFor`, in JavaScript: nulls last on activity
 * whichever way the column points, and the name as the tiebreak everywhere.
 * The complete list merges two queries, so the final sort happens here.
 */
function compareAccounts(sort: AccountSort, direction: SortDirection) {
  const sign = direction === "asc" ? 1 : -1
  const byName = (a: AccountRow, b: AccountRow) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return (a: AccountRow, b: AccountRow) => {
    switch (sort) {
      case "coaches":
        return sign * (a.staffCount - b.staffCount) || byName(a, b)
      case "activity": {
        const left = a.lastActivityAt?.getTime() ?? null
        const right = b.lastActivityAt?.getTime() ?? null
        if (left === null || right === null) {
          return (
            (left === null ? 1 : 0) - (right === null ? 1 : 0) || byName(a, b)
          )
        }
        return sign * (left - right) || byName(a, b)
      }
      case "open":
        return sign * (a.openCases - b.openCases) || byName(a, b)
      default:
        return sign * byName(a, b)
    }
  }
}

/**
 * Every school in one list: the staff accounts and every school a coach
 * typed in, down to the ones only one coach named — which the Prospective
 * view's two-coach floor hides, and which therefore appear nowhere else.
 *
 * A school with a staff account AND coaches who typed it without being on
 * that account is two rows, deliberately: the account exists, and those
 * coaches are not on it. Folding them together would hide the gap that
 * makes this list worth reading.
 *
 * Both halves are aggregated and ordered in SQL; only the merge of two
 * already-sorted pages happens here.
 */
export function listAllAccounts(
  db: Db,
  filters: AccountListFilters = {},
  sort: AccountSort = "coaches",
  direction: SortDirection = DEFAULT_DIRECTIONS.coaches
) {
  const staff = staffAccounts(db, filters)
  const schools = prospectiveAccounts(db, filters, 1)
  const pageOf = (query: AccountsQuery) =>
    query.rows(ALL_ACCOUNTS_LIMIT, 0, orderFor(sort, direction, query.columns))
  const rows = [...pageOf(staff), ...pageOf(schools)]
    .sort(compareAccounts(sort, direction))
    .slice(0, ALL_ACCOUNTS_LIMIT)
  return { rows, total: staff.total() + schools.total() }
}
