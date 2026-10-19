import "server-only"

import Stripe from "stripe"

import { DEFAULT_TIME_ZONE } from "@/lib/clock"
import {
  CHARGES_LOOKBACK_DAYS,
  computeStripeMetrics,
  type StripeData,
  type StripeMetrics,
} from "@/lib/stripe-metrics"
import { CONNECTING, NOT_CONNECTED, type StripeHealth, type StripeSummary } from "@/lib/stripe-summary"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

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
 *
 * A request never waits for a sync (a full one takes minutes): it gets the
 * copy there is now — or `connecting` before the first sync lands (with a
 * key; `not_connected` without one, or after a first sync failed) — and
 * a due sync starts in the background, one at a time, cut off after
 * `SYNC_TIMEOUT_MS`.
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

export type Loader = (
  config: Extract<StripeConfig, { kind: "ok" }>,
  now: Date,
  /** Aborted when the sync runs out of time. */
  signal?: AbortSignal
) => Promise<StripeData>

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
  if (typeof type === "string" && /^(Stripe\w+Error|IncompleteData|InvalidData|SyncTimeout)$/.test(type)) return type
  return "UnknownError"
}

/* ----------------------------------------------------------------- cache */

/** How long a good sync is served before the next request re-reads Stripe. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying Stripe again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { data: StripeData; syncedAt: number }

export type StripeService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  summary(timeZone: string): Promise<StripeSummary>
  health(): Promise<StripeHealth>
  /**
   * Settles when the background sync running now (if any) is done. Routes
   * hand it to `after()` so the platform keeps the sync alive past the
   * response.
   */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createStripeService({
  env = () => process.env,
  load = loadFromStripe,
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[stripe] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): StripeService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let computed = new Map<string, StripeMetrics>()
  /** Bumped by `reset()`, so a sync started before it cannot write after it. */
  let generation = 0

  async function sync(config: Extract<StripeConfig, { kind: "ok" }>) {
    const at = clock()
    const mine = generation
    try {
      const data = await withTimeout((signal) => load(config, new Date(at), signal), timeoutMs)
      if (mine !== generation) return
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
      if (mine !== generation) return
      // Retry a minute after it failed, not after it started: a sync that
      // timed out would otherwise be due again at once.
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  /**
   * Whether the copy is current, starting a sync in the background when
   * one is due and none is running. Never waits for it; never throws.
   */
  function read(): { fresh: boolean; configured: boolean; connecting: boolean } {
    const config = readStripeConfig(env())
    if (config.kind !== "ok") return { fresh: false, configured: false, connecting: false }
    const age = lastAttempt ? clock() - lastAttempt.at : Infinity
    const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
    if (due && !inflight) {
      const run: Promise<void> = sync(config).finally(() => {
        if (inflight === run) inflight = null
      })
      inflight = run
    }
    // A refresh running behind a good copy leaves it current; only a
    // failed sync makes it stale.
    // No sync has finished yet: the first one (started above) is running.
    return { fresh: Boolean(lastAttempt?.ok && lastGood), configured: true, connecting: !lastAttempt && !lastGood }
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
      const { fresh, connecting } = read()
      const snapshot = lastGood
      if (!snapshot) return connecting ? CONNECTING : NOT_CONNECTED
      return {
        status: fresh ? "connected" : "stale",
        lastSyncedAt: new Date(snapshot.syncedAt).toISOString(),
        metrics: metricsFor(snapshot, timeZone),
      }
    },
    async health() {
      const { fresh, configured, connecting } = read()
      if (!configured) return "not_configured"
      if (connecting) return "connecting"
      return fresh ? "ok" : "unavailable"
    },
    async settled() {
      await inflight
    },
    reset() {
      generation += 1
      lastGood = null
      lastAttempt = null
      inflight = null
      computed = new Map()
    },
  }
}

/** The one cache for this server process, shared by every route. */
export const stripeService = createStripeService()
