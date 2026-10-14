import "server-only"

import Stripe from "stripe"

import { DEFAULT_TIME_ZONE } from "@/lib/clock"
import {
  CHARGES_LOOKBACK_DAYS,
  computeStripeMetrics,
  type StripeData,
  type StripeMetrics,
} from "@/lib/stripe-metrics"
import { NOT_CONNECTED, type StripeHealth, type StripeSummary } from "@/lib/stripe-summary"

/**
 * Live Stripe, read-only, server only. The key lives in one server env var
 * and never leaves this module: it is not logged, not returned, and nothing
 * here is importable from a client component (`server-only`).
 *
 * One sync lists every subscription, every paid invoice and the last two
 * weeks of charges (read-only list calls), keeps the result for `CACHE_TTL_MS`, and keeps
 * the last good copy indefinitely so a Stripe outage shows the last figures
 * as stale instead of nothing. Figures are computed from the copy on each
 * request, in the caller's time zone.
 */

/* ----------------------------------------------------------------- config */

type Env = Record<string, string | undefined>

/** A loopback Stripe stand-in for local runs and tests. */
export type MockBase = { host: string; port: number; protocol: "http" | "https" }

export type StripeConfig =
  | { kind: "missing" }
  /** Set, but not something this module will send anywhere. */
  | { kind: "invalid" }
  | { kind: "ok"; key: string; base: MockBase | null }

/** Restricted (rk_) or secret (sk_) keys, live or test. Nothing else is sent. */
const KEY_PATTERN = /^(rk|sk)_(live|test)_[A-Za-z0-9]+$/
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

function mockBase(raw: string): MockBase | null {
  try {
    const url = new URL(raw)
    if (!LOOPBACK.has(url.hostname)) return null
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    const protocol = url.protocol === "http:" ? "http" : "https"
    return { host: url.hostname, port: Number(url.port || (protocol === "http" ? 80 : 443)), protocol }
  } catch {
    return null
  }
}

/**
 * Read the key (and an optional mock base) from the environment.
 * `STRIPE_API_BASE` may only point at this machine, and only outside a
 * production build unless `STRIPE_ALLOW_MOCK_BASE=1` says so; a base that
 * breaks either rule makes the whole config invalid, so a key is never
 * sent to the wrong place.
 */
export function readStripeConfig(env: Env = process.env): StripeConfig {
  const key = env.STRIPE_READONLY_KEY?.trim()
  if (!key) return { kind: "missing" }
  if (!KEY_PATTERN.test(key)) return { kind: "invalid" }
  const rawBase = env.STRIPE_API_BASE?.trim()
  if (!rawBase) return { kind: "ok", key, base: null }
  const allowed = env.NODE_ENV !== "production" || env.STRIPE_ALLOW_MOCK_BASE === "1"
  const base = allowed ? mockBase(rawBase) : null
  return base ? { kind: "ok", key, base } : { kind: "invalid" }
}

/* ----------------------------------------------------------------- fetch */

/** Above this, the lists are not complete enough to count from. */
const MAX_ROWS = 10_000

export type Loader = (config: Extract<StripeConfig, { kind: "ok" }>, now: Date) => Promise<StripeData>

/**
 * The read-only calls: `subscriptions.list` (every status, with discounts
 * and their coupons expanded for MRR), `invoices.list` (paid, for each
 * subscription's first payment) and `charges.list` since the Monday
 * before last. Only the fields the metrics read are kept — no customer
 * names, emails or card details are held in memory.
 */
export const loadFromStripe: Loader = async (config, now) => {
  const stripe = new Stripe(config.key, {
    maxNetworkRetries: 1,
    timeout: 20_000,
    telemetry: false,
    appInfo: { name: "hotdash-founder-dashboard" },
    ...(config.base ?? {}),
  })
  const since = Math.floor(now.getTime() / 1000) - CHARGES_LOOKBACK_DAYS * 86_400

  const [subscriptions, charges, paidInvoices] = await Promise.all([
    stripe.subscriptions
      .list({ status: "all", limit: 100, expand: ["data.discounts.source.coupon"] })
      .autoPagingToArray({ limit: MAX_ROWS }),
    stripe.charges.list({ limit: 100, created: { gte: since } }).autoPagingToArray({ limit: MAX_ROWS }),
    // Every paid invoice, listed once and joined on subscription id below
    // (not one lookup per subscription), for "has paid at least once".
    stripe.invoices.list({ status: "paid", limit: 100 }).autoPagingToArray({ limit: MAX_ROWS }),
  ])
  if (subscriptions.length >= MAX_ROWS || charges.length >= MAX_ROWS || paidInvoices.length >= MAX_ROWS) {
    throw new IncompleteDataError()
  }

  const firstPaid = firstPaidBySubscription(paidInvoices)

  return {
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      first_paid_at: firstPaid.get(s.id) ?? null,
      status: s.status,
      currency: s.currency,
      created: s.created,
      start_date: s.start_date,
      trial_start: s.trial_start,
      trial_end: s.trial_end,
      ended_at: s.ended_at,
      canceled_at: s.canceled_at,
      cancellation_details: { reason: s.cancellation_details?.reason ?? null },
      discounts: s.discounts.map(slimDiscount),
      items: {
        data: s.items.data.map((item) => ({
          quantity: item.quantity ?? null,
          discounts: item.discounts.map(slimDiscount),
          price: {
            currency: item.price.currency,
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
    })),
    charges: charges.map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      captured: c.captured,
      created: c.created,
    })),
  }
}

/** Earliest paid moment per subscription, over invoices with `amount_paid > 0`. */
export function firstPaidBySubscription(
  invoices: ReadonlyArray<{
    amount_paid: number
    created: number
    status_transitions?: { paid_at?: number | null } | null
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null
  }>
) {
  const out = new Map<string, number>()
  for (const inv of invoices) {
    if (!(inv.amount_paid > 0)) continue
    const sub = inv.parent?.subscription_details?.subscription
    const id = typeof sub === "string" ? sub : sub?.id
    if (!id) continue
    const at = inv.status_transitions?.paid_at ?? inv.created
    const prev = out.get(id)
    if (prev === undefined || at < prev) out.set(id, at)
  }
  return out
}

function slimDiscount(d: string | Stripe.Discount) {
  if (typeof d === "string") return d
  const coupon = d.source?.coupon
  return {
    start: d.start,
    end: d.end,
    source: {
      coupon:
        coupon && typeof coupon === "object"
          ? {
              amount_off: coupon.amount_off,
              percent_off: coupon.percent_off,
              currency: coupon.currency,
              duration: coupon.duration,
            }
          : null,
    },
  }
}

class IncompleteDataError extends Error {
  readonly type = "IncompleteData"
}

/**
 * A word for the log, never the error's message: Stripe's messages can
 * quote part of the key. Stripe errors carry a class name in `type`.
 */
export function failureKind(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type
  if (typeof type === "string" && /^(Stripe\w+Error|IncompleteData|InvalidData)$/.test(type)) return type
  return "UnknownError"
}

/* ----------------------------------------------------------------- cache */

/** How long a good sync is served before the next request re-reads Stripe. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed sync, wait this long before trying Stripe again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { data: StripeData; syncedAt: number }

export type StripeService = {
  summary(timeZone: string): Promise<StripeSummary>
  health(): Promise<StripeHealth>
  /** Tests only: forget everything. */
  reset(): void
}

export function createStripeService({
  env = () => process.env,
  load = loadFromStripe,
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  log = (kind: string) => console.warn(`[stripe] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  log?: (kind: string) => void
} = {}): StripeService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let computed = new Map<string, StripeMetrics>()

  async function sync(config: Extract<StripeConfig, { kind: "ok" }>) {
    const at = clock()
    try {
      const data = await load(config, new Date(at))
      // Prove the copy computes before it replaces a good one.
      try {
        computeStripeMetrics(data, { now: new Date(at), timeZone: DEFAULT_TIME_ZONE })
      } catch {
        throw Object.assign(new Error("invalid data"), { type: "InvalidData" })
      }
      lastGood = { data, syncedAt: at }
      computed = new Map()
      lastAttempt = { at, ok: true }
    } catch (error) {
      lastAttempt = { at, ok: false }
      log(failureKind(error))
    }
  }

  /** The copy to serve, and whether it is current. Never throws. */
  async function read(): Promise<{ fresh: boolean; configured: boolean }> {
    const config = readStripeConfig(env())
    if (config.kind !== "ok") return { fresh: false, configured: false }
    const age = lastAttempt ? clock() - lastAttempt.at : Infinity
    const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
    if (due) {
      inflight ??= sync(config).finally(() => {
        inflight = null
      })
      await inflight
    }
    return { fresh: Boolean(lastAttempt?.ok && lastGood), configured: true }
  }

  function metricsFor(snapshot: Snapshot, timeZone: string) {
    let m = computed.get(timeZone)
    if (!m) {
      m = computeStripeMetrics(snapshot.data, { now: new Date(snapshot.syncedAt), timeZone })
      computed.set(timeZone, m)
    }
    return m
  }

  return {
    async summary(timeZone) {
      const { fresh } = await read()
      const snapshot = lastGood
      if (!snapshot) return NOT_CONNECTED
      return {
        status: fresh ? "connected" : "stale",
        lastSyncedAt: new Date(snapshot.syncedAt).toISOString(),
        metrics: metricsFor(snapshot, timeZone),
      }
    },
    async health() {
      const { fresh, configured } = await read()
      if (!configured) return "not_configured"
      return fresh ? "ok" : "unavailable"
    },
    reset() {
      lastGood = null
      lastAttempt = null
      inflight = null
      computed = new Map()
    },
  }
}

/** The one cache for this server process, shared by every route. */
export const stripeService = createStripeService()
