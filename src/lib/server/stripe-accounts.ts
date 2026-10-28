import "server-only"

import { sql } from "drizzle-orm"
import Stripe from "stripe"

import type {
  AccountDetailResponse,
  AccountOrg,
  AccountUser,
  AccountsResponse,
  AccountsSource,
} from "@/lib/crm/accounts/model"
import { emptyAccounts, sortOrgs } from "@/lib/crm/accounts/model"
import { getDb } from "@/lib/crm/db/client"
import { cases, contacts, organizations } from "@/lib/crm/db/schema"
import { planLabelFor } from "@/lib/crm/stripe/plan-map"
import { subscriptionMrrCents, type StripeSubscription } from "@/lib/stripe-metrics"
import { failureKind, readStripeConfig, type StripeConfig } from "@/lib/server/stripe"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * Accounts (organizations and their users), server only. Two read-only sources:
 *
 * - **Stripe** (the dashboard's `STRIPE_READONLY_KEY`, through
 *   `readStripeConfig`): `customers.list` and `subscriptions.list`. Only
 *   the fields below are kept; the key is never logged or returned.
 * - **The CRM database**: organizations, contacts (with their Stripe
 *   customer id, plan and organization) and not-closed case counts.
 *
 * Organization identity: a contact's CRM organization (synced from Chlk's
 * `organization_id`) wins; a Stripe customer whose contact has none can
 * name one in its metadata (`organization`, `org`, `school`, …), matched to
 * a CRM organization by name or shown on its own. Its users are the
 * contacts attached; its plan, status and MRR come from its subscriptions.
 *
 * Cached like the other Stripe reads: a copy is served for `CACHE_TTL_MS`
 * and the last good one is kept through an outage (stale). A request never
 * waits for a read: before the first lands it is `connecting`; a failed
 * first read is `not_connected` with when it was tried.
 */

export const CACHE_TTL_MS = 5 * 60_000
export const RETRY_AFTER_MS = 60_000
/** Above this, the lists are not complete enough to group from. */
const MAX_ROWS = 10_000

/* ------------------------------------------------------------------ input */

export type AccountsCustomer = {
  id: string
  name: string | null
  email: string | null
  metadata: Record<string, string>
}

export type AccountsSubscription = StripeSubscription & {
  customer: string | null
  price_id: string | null
  product_id: string | null
}

export type StripeAccountsData = { customers: AccountsCustomer[]; subscriptions: AccountsSubscription[] }

export type AppOrg = { id: string; name: string; domain: string | null }
export type AppContact = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  organizationId: string | null
  stripeCustomerId: string | null
  plan: string | null
  planStatus: string | null
}
export type AppAccountsData = {
  orgs: AppOrg[]
  contacts: AppContact[]
  /** Not-closed cases per organization id; null when cases could not be read. */
  openCasesByOrg: Map<string, number> | null
}

/* ---------------------------------------------------------------- loaders */

function stripeClient(config: Extract<StripeConfig, { kind: "ok" }>) {
  return new Stripe(config.key, {
    maxNetworkRetries: 1,
    timeout: 20_000,
    telemetry: false,
    appInfo: { name: "hotdash-founder-dashboard" },
    ...(config.base ?? {}),
  })
}

function stringMetadata(m: Stripe.Metadata | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === "string") out[k] = v
  return out
}

/** One subscription, slimmed to what Accounts reads (no payment details). */
export function slimSubscription(s: Stripe.Subscription): AccountsSubscription {
  const price = s.items.data[0]?.price
  return {
    id: s.id,
    customer: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
    status: s.status,
    currency: s.currency,
    created: s.created,
    start_date: s.start_date,
    trial_start: s.trial_start,
    trial_end: s.trial_end,
    ended_at: s.ended_at,
    canceled_at: s.canceled_at,
    price_id: price?.id ?? null,
    product_id: typeof price?.product === "string" ? price.product : (price?.product?.id ?? null),
    discounts: (s.discounts ?? []).map((d) => (typeof d === "string" ? d : { start: d.start, end: d.end, source: { coupon: typeof d.source?.coupon === "object" ? d.source.coupon : null } })),
    items: {
      data: s.items.data.map((item) => ({
        quantity: item.quantity ?? null,
        price: {
          currency: item.price.currency,
          nickname: item.price.nickname ?? null,
          unit_amount: item.price.unit_amount,
          unit_amount_decimal: item.price.unit_amount_decimal === null ? null : String(item.price.unit_amount_decimal),
          recurring: item.price.recurring && {
            interval: item.price.recurring.interval,
            interval_count: item.price.recurring.interval_count,
            usage_type: item.price.recurring.usage_type,
          },
        },
      })),
    },
  }
}

export function slimCustomer(c: Stripe.Customer | Stripe.DeletedCustomer): AccountsCustomer | null {
  if ("deleted" in c && c.deleted) return null
  const cu = c as Stripe.Customer
  return { id: cu.id, name: cu.name ?? null, email: cu.email ?? null, metadata: stringMetadata(cu.metadata) }
}

export type StripeAccountsLoader = (config: Extract<StripeConfig, { kind: "ok" }>) => Promise<StripeAccountsData>

export const loadStripeAccounts: StripeAccountsLoader = async (config) => {
  const stripe = stripeClient(config)
  const [customers, subscriptions] = await Promise.all([
    stripe.customers.list({ limit: 100 }).autoPagingToArray({ limit: MAX_ROWS }),
    stripe.subscriptions
      .list({ status: "all", limit: 100, expand: ["data.discounts.source.coupon"] })
      .autoPagingToArray({ limit: MAX_ROWS }),
  ])
  if (customers.length >= MAX_ROWS || subscriptions.length >= MAX_ROWS) {
    throw Object.assign(new Error("incomplete"), { type: "IncompleteData" })
  }
  return {
    customers: customers.map(slimCustomer).filter((c): c is AccountsCustomer => c !== null),
    subscriptions: subscriptions.map(slimSubscription),
  }
}

export type AppAccountsLoader = () => Promise<AppAccountsData>

export const loadAppAccounts: AppAccountsLoader = async () => {
  const db = getDb()
  const [orgRows, contactRows] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, domain: organizations.domain }).from(organizations),
    db
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        organizationId: contacts.organizationId,
        stripeCustomerId: contacts.stripeCustomerId,
        plan: contacts.plan,
        planStatus: contacts.planStatus,
      })
      .from(contacts),
  ])
  let openCasesByOrg: Map<string, number> | null = null
  try {
    const rows = await db
      .select({ orgId: contacts.organizationId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(cases)
      .innerJoin(contacts, sql`${cases.contactId} = ${contacts.id}`)
      .where(sql`${cases.status} != 'closed' and ${contacts.organizationId} is not null`)
      .groupBy(contacts.organizationId)
    openCasesByOrg = new Map(rows.filter((r) => r.orgId).map((r) => [r.orgId!, r.count]))
  } catch (error) {
    console.warn(`[accounts] open cases unavailable: ${failureKind(error)}`)
  }
  return {
    orgs: orgRows,
    contacts: contactRows,
    openCasesByOrg,
  }
}

/* --------------------------------------------------------------- metadata */

/** Metadata keys (any case) that name a customer's organization, in order. */
export const ORG_METADATA_KEYS = ["organization", "organization_name", "org", "org_name", "school", "school_name", "company"]

function metaValue(meta: Record<string, string>, keys: readonly string[]) {
  const lower = new Map(Object.entries(meta).map(([k, v]) => [k.toLowerCase(), v.trim()]))
  for (const k of keys) {
    const v = lower.get(k)
    if (v) return v
  }
  return null
}

const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])

export function isLive(sub: Pick<AccountsSubscription, "status">) {
  return LIVE.has(sub.status)
}

/* ---------------------------------------------------------------- mapping */

const STATUS_RANK: Record<string, number> = {
  active: 6,
  trialing: 5,
  past_due: 4,
  unpaid: 3,
  incomplete: 2,
  paused: 2,
  canceled: 1,
  incomplete_expired: 0,
}

/**
 * The organization's main subscription (its plan and status): the live one
 * with the best status, then the oldest; with none live, the one that
 * ended last.
 */
export function primarySubscription(subs: readonly AccountsSubscription[]) {
  const live = subs.filter(isLive)
  if (live.length > 0) {
    return [...live].sort((a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) || a.created - b.created)[0]!
  }
  return [...subs].sort((a, b) => (b.ended_at ?? b.canceled_at ?? b.created) - (a.ended_at ?? a.canceled_at ?? a.created))[0] ?? null
}

function displayName(c: Pick<AppContact, "firstName" | "lastName" | "email">) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email
}

function domainOf(email: string | null | undefined) {
  const d = email?.split("@")[1]?.toLowerCase()
  return d || null
}

/** Personal mailboxes say nothing about the organization. */
const PERSONAL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "live.com", "me.com", "msn.com"])

/** The most common work domain among the org's users, when it has no domain of its own. */
function commonDomain(users: readonly AccountUser[]) {
  const counts = new Map<string, number>()
  for (const u of users) {
    const d = domainOf(u.email)
    if (d && !PERSONAL_DOMAINS.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [d, n] of counts) if (!best || n > counts.get(best)!) best = d
  return best
}

function metaOrgId(name: string) {
  return `meta-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org"}`
}

/**
 * Stripe + CRM rows → the Accounts body. Pure: `nowSec` only dates the
 * MRR's discounts.
 */
export function buildAccounts(stripe: StripeAccountsData, app: AppAccountsData, nowSec: number) {
  const customers = new Map(stripe.customers.map((c) => [c.id, c]))
  const subsByCustomer = new Map<string, AccountsSubscription[]>()
  for (const s of stripe.subscriptions) {
    if (!s.customer) continue
    const list = subsByCustomer.get(s.customer) ?? []
    list.push(s)
    subsByCustomer.set(s.customer, list)
  }

  type Group = { org: AppOrg; contacts: AppContact[]; customerIds: Set<string> }
  const groups = new Map<string, Group>()
  const byName = new Map<string, string>()
  for (const o of app.orgs) {
    groups.set(o.id, { org: o, contacts: [], customerIds: new Set() })
    byName.set(o.name.trim().toLowerCase(), o.id)
  }
  /** The org a Stripe customer's metadata names: a CRM org by name, else its own. */
  const orgFromMetadata = (customerId: string | null): string | null => {
    const c = customerId ? customers.get(customerId) : undefined
    const name = c ? metaValue(c.metadata, ORG_METADATA_KEYS) : null
    if (!name) return null
    const known = byName.get(name.toLowerCase())
    if (known) return known
    const id = metaOrgId(name)
    if (!groups.has(id)) groups.set(id, { org: { id, name, domain: null }, contacts: [], customerIds: new Set() })
    byName.set(name.toLowerCase(), id)
    return id
  }

  const noOrg: AppContact[] = []
  const linked = new Set<string>()
  for (const contact of app.contacts) {
    if (contact.stripeCustomerId) linked.add(contact.stripeCustomerId)
    const orgId =
      (contact.organizationId && groups.has(contact.organizationId) ? contact.organizationId : null) ??
      orgFromMetadata(contact.stripeCustomerId)
    if (!orgId) {
      // Users are Stripe customers: a Gmail-only sender is not a user anywhere.
      if (contact.stripeCustomerId) noOrg.push(contact)
      continue
    }
    const g = groups.get(orgId)!
    g.contacts.push(contact)
    if (contact.stripeCustomerId) g.customerIds.add(contact.stripeCustomerId)
  }
  // A paying Stripe customer with no CRM contact still brings its
  // subscription to the org its metadata names (not a user).
  for (const c of stripe.customers) {
    if (linked.has(c.id)) continue
    const orgId = orgFromMetadata(c.id)
    if (orgId) groups.get(orgId)!.customerIds.add(c.id)
  }

  const toUser = (contact: AppContact, organization: string | null): AccountUser => ({
    id: contact.id,
    name: displayName(contact),
    email: contact.email,
    organization,
    plan: contact.plan,
    planStatus: contact.planStatus,
  })
  const byUserName = (a: AccountUser, b: AccountUser) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })

  const orgs: AccountOrg[] = []
  for (const g of groups.values()) {
    const users = g.contacts.map((c) => toUser(c, g.org.name)).sort(byUserName)
    const custs = [...g.customerIds].map((id) => customers.get(id)).filter((c): c is AccountsCustomer => Boolean(c))
    const subs = [...g.customerIds].flatMap((id) => subsByCustomer.get(id) ?? [])
    const live = subs.filter(isLive)
    const primary = primarySubscription(subs)
    const canceled = Boolean(primary && !isLive(primary))
    const paying = live.filter((s) => s.status === "active" || s.status === "past_due")
    const mrrCents = Math.round(paying.reduce((n, s) => n + subscriptionMrrCents(s, nowSec), 0))
    const item = primary?.items.data[0]
    const plan = primary
      ? primary.status === "trialing"
        ? "Trial"
        : planLabelFor({ priceId: primary.price_id, productId: primary.product_id, nickname: item?.price.nickname ?? null })
      : null
    orgs.push({
      id: g.org.id,
      name: g.org.name,
      domain: g.org.domain ?? commonDomain(users),
      stripeCustomerId: primary?.customer ?? custs[0]?.id ?? null,
      status: primary?.status ?? "none",
      canceled,
      plan,
      mrrCents,
      openCases: app.openCasesByOrg ? (app.openCasesByOrg.get(g.org.id) ?? 0) : null,
      users,
    })
  }

  return {
    stripeContacts: app.contacts.filter((c) => c.stripeCustomerId).length,
    orgs: sortOrgs(orgs),
    noOrgUsers: noOrg.map((c) => toUser(c, null)).sort(byUserName),
  }
}

/* ---------------------------------------------------------------- service */

type Env = Record<string, string | undefined>

/** Which sources are not set up. Only whether a value is there: never the value. */
export function missingSources(env: Env): AccountsSource[] {
  const missing: AccountsSource[] = []
  if (readStripeConfig(env).kind !== "ok") missing.push("stripe")
  if (!(env.CRM_DATABASE_URL?.trim() || env.DATABASE_URL?.trim())) missing.push("database")
  return missing
}

export type AccountsService = {
  read(): Promise<AccountsResponse>
  detail(orgId: string): Promise<AccountDetailResponse>
  settled(): Promise<void>
  reset(): void
}

export function createAccountsService({
  env = () => process.env,
  loadStripe = loadStripeAccounts,
  loadApp = loadAppAccounts,
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[accounts] read failed: ${kind}`),
}: {
  env?: () => Env
  loadStripe?: StripeAccountsLoader
  loadApp?: AppAccountsLoader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): AccountsService {
  let lastGood: { stripe: StripeAccountsData; app: AppAccountsData; at: number } | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let generation = 0

  async function sync(config: Extract<StripeConfig, { kind: "ok" }>) {
    const mine = generation
    try {
      const [stripe, app] = await withTimeout(() => Promise.all([loadStripe(config), loadApp()]), timeoutMs)
      if (mine !== generation) return
      const at = clock()
      lastGood = { stripe, app, at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error)) // a word only: never a message, key or row
    }
  }

  function current(): AccountsResponse {
    const e = env()
    const missing = missingSources(e)
    if (missing.length > 0) return emptyAccounts("not_connected", { missing })
    const config = readStripeConfig(e) as Extract<StripeConfig, { kind: "ok" }>
    const age = lastAttempt ? clock() - lastAttempt.at : Infinity
    const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
    if (due && !inflight) {
      const run: Promise<void> = sync(config).finally(() => {
        if (inflight === run) inflight = null
      })
      inflight = run
    }
    const lastTriedAt = lastAttempt && !lastAttempt.ok ? new Date(lastAttempt.at).toISOString() : null
    if (!lastGood) return emptyAccounts(lastAttempt ? "not_connected" : "connecting", { lastTriedAt })
    return {
      status: lastAttempt?.ok ? "connected" : "stale",
      missing: [],
      lastSyncedAt: new Date(lastGood.at).toISOString(),
      lastTriedAt,
      ...buildAccounts(lastGood.stripe, lastGood.app, Math.floor(clock() / 1000)),
    }
  }

  return {
    async read() {
      return current()
    },
    async detail(orgId) {
      const { status, missing, lastSyncedAt, lastTriedAt, orgs } = current()
      return { status, missing, lastSyncedAt, lastTriedAt, org: orgs.find((o) => o.id === orgId) ?? null }
    },
    async settled() {
      await inflight
    },
    reset() {
      generation += 1
      lastGood = null
      lastAttempt = null
      inflight = null
    },
  }
}

/** The one Accounts cache for this server process. */
export const accountsService = createAccountsService()
