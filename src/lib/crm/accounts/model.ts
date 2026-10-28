import { CENTRAL } from "@/lib/clock"

/**
 * The Accounts screen's contract with `/api/crm/accounts`, and everything
 * the screen derives from it (chips, tags, tabs, sort, search). Client
 * safe: no Stripe or database code here. The server builds these shapes in
 * `@/lib/server/stripe-accounts`.
 *
 * An organization is a CRM organization (Chlk's `organization_id`, synced
 * into the CRM database), or — for a Stripe customer whose contact has none
 * — the organization named in that customer's Stripe metadata. Seats total
 * is the Stripe subscription item quantity; seats used is the number of
 * CRM contacts attached to the organization.
 */

export const ACCOUNTS_PATH = "/api/crm/accounts"

export type AccountUser = {
  id: string
  name: string
  email: string
  organization: string | null
  /** When this user's Stripe subscription (or customer) started, ISO. */
  startedAt: string | null
  plan: string | null
  planStatus: string | null
}

/** What the Renews date means for this organization. */
export type RenewalKind = "renews" | "trial_ends" | "cancels" | "ended"

export type AccountOrg = {
  id: string
  name: string
  domain: string | null
  stripeCustomerId: string | null
  /** The seat subscription (the Add seats link), null when there is none. */
  subscriptionId: string | null
  /** The seat subscription's Stripe status, or "none". */
  status: string
  canceled: boolean
  plan: string | null
  interval: string | null
  seatsUsed: number
  /** Stripe item quantity; null when the organization has no subscription. */
  seatsTotal: number | null
  /** Monthly price of one seat, in cents, when Stripe has a unit amount. */
  seatMonthlyCents: number | null
  customerSince: string | null
  renewsAt: string | null
  renewalKind: RenewalKind | null
  termMonths: number | null
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
    typeof v.seatsUsed === "number" &&
    (v.seatsTotal === null || typeof v.seatsTotal === "number") &&
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

/* ------------------------------------------------------------------ chips */

export type SeatChip = { kind: "open"; n: number } | { kind: "full" } | { kind: "over"; n: number }

/** Green "N open", amber "Full" or red "+N over"; null without a seat count. */
export function seatChip(used: number, total: number | null): SeatChip | null {
  if (total === null) return null
  if (used < total) return { kind: "open", n: total - used }
  if (used === total) return { kind: "full" }
  return { kind: "over", n: used - total }
}

export function seatChipLabel(chip: SeatChip) {
  if (chip.kind === "open") return `${chip.n} open`
  if (chip.kind === "full") return "Full"
  return `+${chip.n} over`
}

/** The fill bar's width, 0–100 (an over-limit org is a full bar). */
export function seatFillPct(used: number, total: number | null) {
  if (!total || total <= 0) return used > 0 ? 100 : 0
  return Math.min(100, Math.round((used / total) * 100))
}

export const DAY_MS = 86_400_000
/** A renewal this close (days) gets the amber "in N days" tag. */
export const RENEWAL_SOON_DAYS = 30

export type RenewalTag = { kind: "lapsed" } | { kind: "soon"; days: number }

/** Whole days from now until `iso`, rounded up (later today is 0, tomorrow 1). */
export function daysUntil(iso: string, nowMs: number) {
  return Math.ceil((Date.parse(iso) - nowMs) / DAY_MS)
}

/** Red "Lapsed" for a canceled org; amber "in N days" within 30 days; else none. */
export function renewalTag(org: Pick<AccountOrg, "canceled" | "renewsAt">, nowMs: number): RenewalTag | null {
  if (org.canceled) return { kind: "lapsed" }
  if (!org.renewsAt) return null
  const days = daysUntil(org.renewsAt, nowMs)
  if (days < 0 || days > RENEWAL_SOON_DAYS) return null
  return { kind: "soon", days }
}

export function renewalTagLabel(tag: RenewalTag) {
  if (tag.kind === "lapsed") return "Lapsed"
  if (tag.days === 0) return "today"
  return tag.days === 1 ? "in 1 day" : `in ${tag.days} days`
}

/* ------------------------------------------------------------- tabs, sort */

export const ACCOUNT_TABS = [
  { id: "all", label: "All", short: "All" },
  { id: "open", label: "Open seats", short: "Open seats" },
  { id: "full", label: "Full", short: "Full" },
  { id: "over", label: "Over limit", short: "Over" },
  { id: "canceled", label: "Canceled", short: "Canceled" },
  { id: "no_org", label: "No organization", short: "No org" },
] as const
export type AccountTab = (typeof ACCOUNT_TABS)[number]["id"]

export function isAccountTab(v: unknown): v is AccountTab {
  return ACCOUNT_TABS.some((t) => t.id === v)
}

/** Which seat tab an org falls in; canceled wins; none without a seat count. */
export function orgTab(org: AccountOrg): Exclude<AccountTab, "all" | "no_org"> | null {
  if (org.canceled) return "canceled"
  const chip = seatChip(org.seatsUsed, org.seatsTotal)
  return chip ? chip.kind : null
}

export function filterOrgs(orgs: readonly AccountOrg[], tab: AccountTab): AccountOrg[] {
  if (tab === "all") return [...orgs]
  if (tab === "no_org") return []
  return orgs.filter((o) => orgTab(o) === tab)
}

export const ACCOUNT_SORTS = [
  { id: "renewal", label: "Renewal (soonest)" },
  { id: "renewal_desc", label: "Renewal (latest)" },
  { id: "name", label: "Name (A–Z)" },
  { id: "users", label: "Most users" },
  { id: "open_seats", label: "Most open seats" },
  { id: "mrr", label: "MRR (highest)" },
  { id: "customer_since", label: "Customer since (oldest)" },
] as const
export type AccountSort = (typeof ACCOUNT_SORTS)[number]["id"]
export const DEFAULT_SORT: AccountSort = "renewal"

export function isAccountSort(v: unknown): v is AccountSort {
  return ACCOUNT_SORTS.some((s) => s.id === v)
}

function time(iso: string | null) {
  return iso ? Date.parse(iso) : NaN
}

/** Ascending; missing values always last, whatever the direction. */
function byNumber(a: number, b: number, dir: 1 | -1) {
  const am = Number.isNaN(a)
  const bm = Number.isNaN(b)
  if (am || bm) return am === bm ? 0 : am ? 1 : -1
  return (a - b) * dir
}

/**
 * Sorted copy. Renewal (soonest) puts live renewals first, soonest on top;
 * canceled orgs (lapsed) and orgs with no date go after them. Ties break
 * on name, so the order never jumps.
 */
export function sortOrgs(orgs: readonly AccountOrg[], sort: AccountSort): AccountOrg[] {
  const name = (a: AccountOrg, b: AccountOrg) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  const cmp = (a: AccountOrg, b: AccountOrg): number => {
    switch (sort) {
      case "renewal":
      case "renewal_desc": {
        if (a.canceled !== b.canceled) return a.canceled ? 1 : -1
        return byNumber(time(a.renewsAt), time(b.renewsAt), sort === "renewal" ? 1 : -1)
      }
      case "name":
        return 0
      case "users":
        return b.seatsUsed - a.seatsUsed
      case "open_seats": {
        const open = (o: AccountOrg) => (o.seatsTotal === null || o.canceled ? -Infinity : o.seatsTotal - o.seatsUsed)
        const d = open(b) - open(a)
        return Number.isNaN(d) ? 0 : d
      }
      case "mrr":
        return b.mrrCents - a.mrrCents
      case "customer_since":
        return byNumber(time(a.customerSince), time(b.customerSince), 1)
    }
  }
  return [...orgs].sort((a, b) => cmp(a, b) || name(a, b))
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

/** The rows a tab shows for a query: orgs (sorted) and the no-org users. */
export function visibleAccounts(
  data: Pick<AccountsResponse, "orgs" | "noOrgUsers">,
  { tab, q, sort }: { tab: AccountTab; q: string; sort: AccountSort }
) {
  const orgs = tab === "no_org" ? [] : sortOrgs(searchOrgs(filterOrgs(data.orgs, tab), q), sort)
  // The No organization row shows on All (and is the whole of its own tab).
  const noOrgUsers = tab === "all" || tab === "no_org" ? searchUsers(data.noOrgUsers, q) : []
  return { orgs, noOrgUsers }
}

/* ---------------------------------------------------------------- summary */

export type AccountsTotals = {
  organizations: number
  usersAttached: number
  usersNoOrg: number
  /** Over orgs with a live (not canceled) subscription. */
  activeOrgs: number
  totalSeats: number
  seatsUsed: number
  openSeats: number
  openOrgs: number
  fullOrgs: number
  overOrgs: number
  canceledOrgs: number
}

export function accountsTotals(data: Pick<AccountsResponse, "orgs" | "noOrgUsers">): AccountsTotals {
  const t: AccountsTotals = {
    organizations: data.orgs.length,
    usersAttached: 0,
    usersNoOrg: data.noOrgUsers.length,
    activeOrgs: 0,
    totalSeats: 0,
    seatsUsed: 0,
    openSeats: 0,
    openOrgs: 0,
    fullOrgs: 0,
    overOrgs: 0,
    canceledOrgs: 0,
  }
  for (const o of data.orgs) {
    t.usersAttached += o.seatsUsed
    const tab = orgTab(o)
    if (tab === "canceled") t.canceledOrgs += 1
    if (tab === "open") t.openOrgs += 1
    if (tab === "full") t.fullOrgs += 1
    if (tab === "over") t.overOrgs += 1
    if (o.canceled || o.seatsTotal === null) continue
    t.activeOrgs += 1
    t.totalSeats += o.seatsTotal
    t.seatsUsed += o.seatsUsed
    t.openSeats += Math.max(0, o.seatsTotal - o.seatsUsed)
  }
  return t
}

export function tabCount(totals: AccountsTotals, tab: AccountTab) {
  switch (tab) {
    case "all":
      return totals.organizations
    case "open":
      return totals.openOrgs
    case "full":
      return totals.fullOrgs
    case "over":
      return totals.overOrgs
    case "canceled":
      return totals.canceledOrgs
    case "no_org":
      return totals.usersNoOrg
  }
}

/* ------------------------------------------------------------- formatting */

export function formatMonthYear(iso: string | null, timeZone: string = CENTRAL) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone }).format(new Date(iso))
}

export function formatDay(iso: string | null, timeZone: string = CENTRAL) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(iso))
}

/** Whole dollars, "$1,240"; "—" for nothing. */
export function formatMrr(cents: number) {
  if (!cents || cents <= 0) return "—"
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`
}

export function orgInitials(name: string) {
  const words = name.split(/[\s.@_-]+/).filter(Boolean)
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase()
}

/** Stripe's dashboard page for the subscription: where seats are changed, never from here. */
export function stripeSubscriptionUrl(subscriptionId: string | null) {
  if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return null
  return `https://dashboard.stripe.com/subscriptions/${subscriptionId}`
}

export function termLabel(months: number | null) {
  if (!months) return "—"
  return months === 1 ? "1 month" : `${months} months`
}
