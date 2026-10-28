/**
 * The Accounts screen's contract with `/api/crm/accounts`, and everything
 * the screen derives from it (tabs, sort, search, totals). Client
 * safe: no Stripe or database code here. The server builds these shapes in
 * `@/lib/server/stripe-accounts`.
 *
 * An organization is a CRM organization (Chlk's `organization_id`, synced
 * into the CRM database), or — for a Stripe customer whose contact has none
 * — the organization named in that customer's Stripe metadata. Its users
 * are the CRM contacts attached to it.
 */

export const ACCOUNTS_PATH = "/api/crm/accounts"

export type AccountUser = {
  id: string
  name: string
  email: string
  organization: string | null
  plan: string | null
  planStatus: string | null
}

export type AccountOrg = {
  id: string
  name: string
  domain: string | null
  stripeCustomerId: string | null
  /** The main subscription's Stripe status, or "none". */
  status: string
  canceled: boolean
  plan: string | null
  /** Monthly-normalized, in cents. */
  mrrCents: number
  /** Not-closed CRM cases of its users; null when cases could not be read. */
  openCases: number | null
  users: AccountUser[]
}

export type AccountsStatus = "connected" | "stale" | "connecting" | "not_connected"
export type AccountsSource = "stripe" | "database"

type AccountsMeta = {
  status: AccountsStatus
  /** Which sources are not set up (not_connected only). */
  missing: AccountsSource[]
  lastSyncedAt: string | null
  /** The last failed read, when there is one: "Last tried 5m ago". */
  lastTriedAt: string | null
}

export type AccountsResponse = AccountsMeta & {
  /** Every CRM contact that came from Stripe (the "imported" count). */
  stripeContacts: number
  orgs: AccountOrg[]
  /** Users whose Stripe customer has no organization. */
  noOrgUsers: AccountUser[]
}

export type AccountDetailResponse = AccountsMeta & { org: AccountOrg | null }

export function emptyAccounts(status: AccountsStatus = "not_connected", extra: Partial<AccountsMeta> = {}): AccountsResponse {
  return { status, missing: [], lastSyncedAt: null, lastTriedAt: null, ...extra, stripeContacts: 0, orgs: [], noOrgUsers: [] }
}

/* ------------------------------------------------------------------ parse */

const STATUSES = new Set<AccountsStatus>(["connected", "stale", "connecting", "not_connected"])

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isUser(v: unknown): v is AccountUser {
  return isObj(v) && typeof v.id === "string" && typeof v.email === "string" && typeof v.name === "string"
}

function isOrg(v: unknown): v is AccountOrg {
  return (
    isObj(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.mrrCents === "number" &&
    typeof v.canceled === "boolean" &&
    Array.isArray(v.users) &&
    v.users.every(isUser)
  )
}

function parseMeta(v: Record<string, unknown>): AccountsMeta | null {
  if (!STATUSES.has(v.status as AccountsStatus)) return null
  return {
    status: v.status as AccountsStatus,
    missing: Array.isArray(v.missing) ? v.missing.filter((m): m is AccountsSource => m === "stripe" || m === "database") : [],
    lastSyncedAt: typeof v.lastSyncedAt === "string" ? v.lastSyncedAt : null,
    lastTriedAt: typeof v.lastTriedAt === "string" ? v.lastTriedAt : null,
  }
}

/** The route's body, or null when it is not one (the screen then says Not connected). */
export function parseAccounts(v: unknown): AccountsResponse | null {
  if (!isObj(v)) return null
  const meta = parseMeta(v)
  if (!meta) return null
  if (!Array.isArray(v.orgs) || !v.orgs.every(isOrg)) return null
  if (!Array.isArray(v.noOrgUsers) || !v.noOrgUsers.every(isUser)) return null
  return {
    ...meta,
    stripeContacts: typeof v.stripeContacts === "number" ? v.stripeContacts : 0,
    orgs: v.orgs,
    noOrgUsers: v.noOrgUsers,
  }
}

export function parseAccountDetail(v: unknown): AccountDetailResponse | null {
  if (!isObj(v)) return null
  const meta = parseMeta(v)
  if (!meta) return null
  if (v.org !== null && !isOrg(v.org)) return null
  return { ...meta, org: (v.org as AccountOrg | null) ?? null }
}

/* ------------------------------------------------------------- tabs, sort */

export const ACCOUNT_TABS = [
  { id: "all", label: "All", short: "All" },
  { id: "canceled", label: "Canceled", short: "Canceled" },
  { id: "no_org", label: "No organization", short: "No org" },
] as const
export type AccountTab = (typeof ACCOUNT_TABS)[number]["id"]

export function isAccountTab(v: unknown): v is AccountTab {
  return ACCOUNT_TABS.some((t) => t.id === v)
}

export function filterOrgs(orgs: readonly AccountOrg[], tab: AccountTab): AccountOrg[] {
  if (tab === "all") return [...orgs]
  if (tab === "no_org") return []
  return orgs.filter((o) => o.canceled)
}

/** Sorted copy, A to Z by name (case-insensitive); ties break on id, so the order never jumps. */
export function sortOrgs(orgs: readonly AccountOrg[]): AccountOrg[] {
  return [...orgs].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id))
}

/* ----------------------------------------------------------------- search */

export function normalizeQuery(q: string) {
  return q.trim().toLowerCase()
}

export function userMatches(u: AccountUser, q: string) {
  const n = normalizeQuery(q)
  if (!n) return true
  return u.name.toLowerCase().includes(n) || u.email.toLowerCase().includes(n)
}

/** An org matches on its name or domain, or on any of its users' name or email. */
export function orgMatches(o: AccountOrg, q: string) {
  const n = normalizeQuery(q)
  if (!n) return true
  if (o.name.toLowerCase().includes(n)) return true
  if (o.domain?.toLowerCase().includes(n)) return true
  return o.users.some((u) => userMatches(u, n))
}

export function searchOrgs(orgs: readonly AccountOrg[], q: string) {
  return orgs.filter((o) => orgMatches(o, q))
}

export function searchUsers(users: readonly AccountUser[], q: string) {
  return users.filter((u) => userMatches(u, q))
}

/** The rows a tab shows for a query: orgs (A to Z) and the no-org users. */
export function visibleAccounts(data: Pick<AccountsResponse, "orgs" | "noOrgUsers">, { tab, q }: { tab: AccountTab; q: string }) {
  const orgs = tab === "no_org" ? [] : sortOrgs(searchOrgs(filterOrgs(data.orgs, tab), q))
  // The No organization row shows on All (and is the whole of its own tab).
  const noOrgUsers = tab === "all" || tab === "no_org" ? searchUsers(data.noOrgUsers, q) : []
  return { orgs, noOrgUsers }
}

/* ---------------------------------------------------------------- summary */

export type AccountsTotals = {
  organizations: number
  usersAttached: number
  usersNoOrg: number
  canceledOrgs: number
}

export function accountsTotals(data: Pick<AccountsResponse, "orgs" | "noOrgUsers">): AccountsTotals {
  return {
    organizations: data.orgs.length,
    usersAttached: data.orgs.reduce((n, o) => n + o.users.length, 0),
    usersNoOrg: data.noOrgUsers.length,
    canceledOrgs: data.orgs.filter((o) => o.canceled).length,
  }
}

export function tabCount(totals: AccountsTotals, tab: AccountTab) {
  switch (tab) {
    case "all":
      return totals.organizations
    case "canceled":
      return totals.canceledOrgs
    case "no_org":
      return totals.usersNoOrg
  }
}

/* ------------------------------------------------------------- formatting */

/** Whole dollars, "$1,240"; "—" for nothing. */
export function formatMrr(cents: number) {
  if (!cents || cents <= 0) return "—"
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`
}

export function orgInitials(name: string) {
  const words = name.split(/[\s.@_-]+/).filter(Boolean)
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase()
}
