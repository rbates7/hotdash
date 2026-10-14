import {
  PERIOD_DAYS,
  addDays,
  startOfDay,
  startOfWeek,
  todayIn,
  windowsEnding,
} from "@/lib/clock"

/**
 * The business numbers, computed from what Stripe returns. Pure: the server
 * hands in the subscriptions and charges it fetched (read-only) and the
 * instant they were fetched, and gets back what the dashboard shows. Every
 * definition below is a decision, so each is written down where it is made.
 *
 * Money is in Stripe's minor units (cents) in, whole currency units out.
 * Only `REPORTING_CURRENCY` is counted; other currencies are skipped rather
 * than summed at a made-up rate.
 */

export const REPORTING_CURRENCY = "usd"

/* ----------------------------------------------------------------- input */

/**
 * The slice of a Stripe object each calculation reads. Real Stripe objects
 * fit these shapes; tests build them by hand.
 */
export type StripeCoupon = {
  amount_off: number | null
  percent_off: number | null
  currency?: string | null
  duration?: string
}

export type StripeDiscount = {
  /** API 2025-09+: the coupon sits under `source`. */
  source?: { coupon?: string | StripeCoupon | null } | null
  /** Older API versions put it on the discount itself. */
  coupon?: string | StripeCoupon | null
  start?: number | null
  end?: number | null
}

export type StripePrice = {
  currency: string
  unit_amount: number | null
  unit_amount_decimal?: unknown
  recurring: {
    interval: "day" | "week" | "month" | "year" | (string & {})
    interval_count: number
    usage_type?: string
  } | null
}

export type StripeSubscriptionItem = {
  price: StripePrice
  quantity?: number | null
  discounts?: Array<string | StripeDiscount> | null
}

export type StripeSubscription = {
  id: string
  status: string
  currency: string
  created: number
  start_date: number
  trial_start: number | null
  trial_end: number | null
  ended_at: number | null
  canceled_at?: number | null
  cancellation_details?: { reason?: string | null } | null
  items: { data: StripeSubscriptionItem[] }
  discounts?: Array<string | StripeDiscount> | null
  /**
   * When the subscription first paid an invoice with `amount_paid > 0`
   * (unix seconds), joined in from one `invoices.list({ status: "paid" })`.
   * `null`/absent: it has never paid (e.g. a 100%-off launch annual).
   */
  first_paid_at?: number | null
}

export type StripeCharge = {
  id: string
  amount: number
  currency: string
  status: string
  captured?: boolean
  created: number
}

/** Everything one sync fetches. */
export type StripeData = {
  subscriptions: StripeSubscription[]
  charges: StripeCharge[]
}

/* ---------------------------------------------------------------- output */

/** `null` means there was nothing to divide by — never a made-up 0. */
export type Rate = number | null

export type StripeMetrics = {
  /** Paying subscriptions (see `isPaying`, Bobbi's definition). */
  subscribers: {
    value: number
    /** At the start of the 28-day window. */
    previous: number
    /** Net change since 00:00 today in the founder's zone. */
    today: number
    /** At the end of each of six 28-day windows, oldest first. */
    series: number[]
  }
  /** Gross succeeded charges since Monday 00:00. */
  cashThisWeek: {
    value: number
    /** Last week, Monday 00:00 to the same point in the week. */
    previous: number
    /** Monday 00:00, ISO. */
    since: string
  }
  /** Monthly-equivalent recurring revenue. */
  mrr: { value: number; previous: number; series: number[] }
  /** % of subscriptions active at a window's start that ended inside it. */
  churn: { value: Rate; previous: Rate; series: Rate[]; churned: number; base: number }
  /** % of trials ending inside a window that became paid subscriptions. */
  trialToPaid: { value: Rate; previous: Rate; series: Rate[]; converted: number; ended: number }
}

/* ------------------------------------------------------------ definitions */

const SECOND = 1000

/**
 * Statuses that count as an active subscriber right now: `active`, plus
 * `past_due` (a renewal failed and Stripe is still retrying — the customer
 * has not left, and Stripe's own dashboard counts them). `trialing` is not
 * counted: nobody has paid yet; trials are measured by trial-to-paid.
 * `unpaid`, `paused`, `incomplete*` and `canceled` are not active.
 */
export const COUNTED_STATUSES: ReadonlySet<string> = new Set(["active", "past_due"])

export function isCounted(sub: Pick<StripeSubscription, "status">) {
  return COUNTED_STATUSES.has(sub.status)
}

/** Statuses that mean the subscription has ended. */
const ENDED_STATUSES: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"])

/**
 * A paying subscriber now (Bobbi's definition, Data, Oct 14 2026): a Stripe
 * subscription that has not ended — any status except `canceled` and
 * `incomplete_expired`, so `past_due` counts, and so would `trialing`,
 * `unpaid` or `paused` (Bobbi found none with paid history) — that has paid
 * at least one invoice with `amount_paid > 0`. App Store payers are not in
 * Stripe and are not counted. No "has a coupon now" filter: a launch annual
 * that paid once and now sits on a coupon still counts, and one that never
 * paid does not.
 */
export function isPaying(sub: Pick<StripeSubscription, "status" | "ended_at" | "first_paid_at">) {
  return !ENDED_STATUSES.has(sub.status) && sub.ended_at == null && sub.first_paid_at != null
}

/** Whether `sub` was a paying subscriber at `atSec`: first paid by then, not yet ended. */
export function payingAt(sub: StripeSubscription, atSec: number) {
  if (sub.first_paid_at == null || sub.status === "incomplete_expired") return false
  if (!ENDED_STATUSES.has(sub.status) && sub.ended_at != null) return false
  return sub.first_paid_at <= atSec && (sub.ended_at == null || atSec < sub.ended_at)
}

export function payingCountAt(subs: readonly StripeSubscription[], atSec: number) {
  return subs.filter((s) => payingAt(s, atSec)).length
}

/** When the subscription started paying: after its trial, if it had one. */
export function paidFrom(sub: StripeSubscription) {
  return Math.max(sub.start_date, sub.trial_end ?? 0)
}

/**
 * Whether `sub` was an active subscriber at `atSec`, for points in the past.
 * Stripe keeps no status history, so this reads the timestamps: paying
 * from the end of any trial until it ended. Only subscriptions that are
 * counted now or have since been canceled qualify; for now (`atSec` ≥ every
 * timestamp) it agrees with `isCounted`.
 */
export function activeAt(sub: StripeSubscription, atSec: number) {
  if (!isCounted(sub) && sub.status !== "canceled") return false
  const from = paidFrom(sub)
  const until = sub.ended_at ?? Infinity
  return from <= atSec && atSec < until && from < until
}

export function activeCountAt(subs: readonly StripeSubscription[], atSec: number) {
  return subs.filter((s) => activeAt(s, atSec)).length
}

/* -------------------------------------------------------------------- MRR */

/** Average months per interval: a year is 12, a week 52/12 of a month's 1. */
const MONTHS_PER: Record<string, number> = {
  day: 12 / 365,
  week: 12 / 52,
  month: 1,
  year: 12,
}

function unitAmount(price: StripePrice): number | null {
  if (price.unit_amount !== null && price.unit_amount !== undefined) return price.unit_amount
  if (price.unit_amount_decimal === null || price.unit_amount_decimal === undefined) return null
  const n = Number(String(price.unit_amount_decimal))
  return Number.isFinite(n) ? n : null
}

/**
 * One item's monthly equivalent in cents, before discounts: unit amount ×
 * quantity, divided by the months its interval spans (`interval_count` of
 * them). Metered and tiered prices (no unit amount) and other currencies
 * have no fixed monthly figure and count as nothing.
 */
export function itemMonthlyCents(item: StripeSubscriptionItem) {
  const { price } = item
  const recurring = price.recurring
  if (!recurring || recurring.usage_type === "metered") return 0
  if (price.currency.toLowerCase() !== REPORTING_CURRENCY) return 0
  const amount = unitAmount(price)
  const perInterval = MONTHS_PER[recurring.interval]
  if (amount === null || !perInterval) return 0
  const months = perInterval * Math.max(1, recurring.interval_count || 1)
  return (amount * (item.quantity ?? 1)) / months
}

function couponOf(discount: string | StripeDiscount): StripeCoupon | null {
  if (typeof discount === "string") return null
  const coupon = discount.source?.coupon ?? discount.coupon
  return coupon && typeof coupon === "object" ? coupon : null
}

function discountLive(discount: string | StripeDiscount, atSec: number) {
  if (typeof discount === "string") return false
  if (discount.start && discount.start > atSec) return false
  return !discount.end || discount.end > atSec
}

/**
 * Apply the discounts live at `atSec` to a monthly figure, best effort:
 * percent-off scales it; amount-off comes off once per billing interval,
 * so it is spread over the same months. A `once` coupon is a one-off, not
 * recurring revenue, so it is ignored. Never below zero. Coupons Stripe
 * returned only as an id (not expanded) cannot be read and are skipped.
 */
export function applyDiscounts(
  monthlyCents: number,
  discounts: readonly (string | StripeDiscount)[] | null | undefined,
  monthsPerInterval: number,
  atSec: number
) {
  let out = monthlyCents
  for (const d of discounts ?? []) {
    if (!discountLive(d, atSec)) continue
    const coupon = couponOf(d)
    if (!coupon || coupon.duration === "once") continue
    if (coupon.percent_off) out *= 1 - coupon.percent_off / 100
    else if (coupon.amount_off && (coupon.currency ?? REPORTING_CURRENCY).toLowerCase() === REPORTING_CURRENCY) {
      out -= coupon.amount_off / monthsPerInterval
    }
  }
  return Math.max(0, out)
}

function monthsPerInterval(item: StripeSubscriptionItem | undefined) {
  const r = item?.price.recurring
  if (!r) return 1
  return (MONTHS_PER[r.interval] ?? 1) * Math.max(1, r.interval_count || 1)
}

/** One subscription's monthly-equivalent revenue at `atSec`, in cents. */
export function subscriptionMrrCents(sub: StripeSubscription, atSec: number) {
  const items = sub.items.data
  const itemsTotal = items.reduce(
    (sum, item) => sum + applyDiscounts(itemMonthlyCents(item), item.discounts, monthsPerInterval(item), atSec),
    0
  )
  return applyDiscounts(itemsTotal, sub.discounts, monthsPerInterval(items[0]), atSec)
}

/**
 * MRR at `atSec`: every subscription paying then (`payingAt`, the same set
 * as Subscribers), USD only, at its
 * current prices — Stripe has no price history, so past points assume
 * today's plan. In whole dollars.
 */
export function mrrAt(subs: readonly StripeSubscription[], atSec: number) {
  const cents = subs.reduce((sum, s) => (payingAt(s, atSec) ? sum + subscriptionMrrCents(s, atSec) : sum), 0)
  return Math.round(cents) / 100
}

/* ------------------------------------------------------------------ churn */

export type Window = { startSec: number; endSec: number }

/**
 * Churn over a window: of the subscriptions active at its start, how many
 * ended (any reason: cancelled, or dropped after failed payments) by its
 * end. Subscriptions that both start and end inside the window are not in
 * the base, so they are not counted, which keeps the rate within 0–100%.
 */
export function churnFor(subs: readonly StripeSubscription[], w: Window) {
  const base = subs.filter((s) => activeAt(s, w.startSec))
  const churned = base.filter((s) => s.ended_at !== null && s.ended_at <= w.endSec).length
  return { churned, base: base.length, rate: rate(churned, base.length) }
}

/* ----------------------------------------------------------- trial-to-paid */

/** When a trial actually stopped: its end, or earlier if cancelled during it. */
function trialStoppedAt(sub: StripeSubscription) {
  if (sub.trial_end === null) return null
  return Math.min(sub.trial_end, sub.ended_at ?? Infinity)
}

/**
 * Whether a finished trial became a paid subscription: it is `active` now,
 * or it ran past its trial and was later cancelled by the customer (it did
 * pay first). A sub that ended at its trial's end, was cancelled during it,
 * is `past_due` on its first invoice, or was dropped because that payment
 * failed did not convert.
 */
export function convertedFromTrial(sub: StripeSubscription) {
  if (sub.trial_end === null) return false
  if (sub.status === "active") return true
  if (sub.status !== "canceled" || sub.ended_at === null) return false
  return sub.ended_at > sub.trial_end && sub.cancellation_details?.reason !== "payment_failed"
}

/**
 * Trial-to-paid over a window: of the trials that stopped inside it, the
 * share that converted. A trial still running is not in either number.
 */
export function trialToPaidFor(subs: readonly StripeSubscription[], w: Window) {
  const ended = subs.filter((s) => {
    if (s.trial_start === null) return false
    const at = trialStoppedAt(s)
    return at !== null && at > w.startSec && at <= w.endSec
  })
  const converted = ended.filter(convertedFromTrial).length
  return { converted, ended: ended.length, rate: rate(converted, ended.length) }
}

/* ------------------------------------------------------------------- cash */

/**
 * Gross cash in over `[fromSec, toSec)`: the full amount of every succeeded,
 * captured charge in the reporting currency. Refunds, fees and disputes are
 * not taken off — this is money that arrived, not the net that stayed.
 */
export function grossChargesCents(charges: readonly StripeCharge[], fromSec: number, toSec: number) {
  return charges.reduce((sum, c) => {
    if (c.status !== "succeeded" || c.captured === false) return sum
    if (c.currency.toLowerCase() !== REPORTING_CURRENCY) return sum
    return c.created >= fromSec && c.created < toSec ? sum + c.amount : sum
  }, 0)
}

/* ------------------------------------------------------------------ helpers */

function rate(part: number, whole: number): Rate {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10
}

const toSec = (d: Date) => Math.floor(d.getTime() / SECOND)

/**
 * The six 28-day windows the Metrics cards chart, as instants: each runs
 * from 00:00 on its first day to 00:00 after its last, in `timeZone`; the
 * current one is cut off at `now`.
 */
export function windowsAt(now: Date, timeZone: string, count = 6): Window[] {
  const today = todayIn(now, timeZone)
  return windowsEnding(today, count, PERIOD_DAYS).map((p, i, all) => ({
    startSec: toSec(startOfDay(p.start, timeZone)),
    endSec: i === all.length - 1 ? toSec(now) : toSec(startOfDay(addDays(p.end, 1), timeZone)),
  }))
}

/** How far back a sync must fetch charges: last week's Monday, in any zone. */
export const CHARGES_LOOKBACK_DAYS = 15

/* ------------------------------------------------------------------ summary */

/**
 * Everything the dashboard shows from Stripe, as of `now` (the moment of
 * the sync, not of the request, so a stale value is internally consistent),
 * with "today" and "this week" on `timeZone`'s calendar.
 */
export function computeStripeMetrics(
  data: StripeData,
  { now, timeZone }: { now: Date; timeZone: string }
): StripeMetrics {
  const subs = data.subscriptions
  const nowSec = toSec(now)
  const windows = windowsAt(now, timeZone)
  const current = windows[windows.length - 1]
  const prior = windows[windows.length - 2]

  const active = subs.filter(isPaying).length
  const todayStart = toSec(startOfDay(todayIn(now, timeZone), timeZone))

  const weekStart = startOfWeek(now, timeZone)
  const lastWeekStart = startOfDay(addDays(todayIn(weekStart, timeZone), -7), timeZone)
  const elapsed = now.getTime() - weekStart.getTime()
  const cash = grossChargesCents(data.charges, toSec(weekStart), nowSec + 1)
  const cashBefore = grossChargesCents(
    data.charges,
    toSec(lastWeekStart),
    toSec(new Date(lastWeekStart.getTime() + elapsed)) + 1
  )

  const churns = windows.map((w) => churnFor(subs, w))
  const trials = windows.map((w) => trialToPaidFor(subs, w))
  const last = churns.length - 1

  return {
    subscribers: {
      value: active,
      previous: payingCountAt(subs, current.startSec),
      today: active - payingCountAt(subs, todayStart),
      series: windows.map((w, i) => (i === windows.length - 1 ? active : payingCountAt(subs, w.endSec))),
    },
    cashThisWeek: {
      value: cash / 100,
      previous: cashBefore / 100,
      since: weekStart.toISOString(),
    },
    mrr: {
      value: mrrAt(subs, nowSec),
      previous: mrrAt(subs, prior.endSec),
      series: windows.map((w) => mrrAt(subs, w.endSec)),
    },
    churn: {
      value: churns[last].rate,
      previous: churns[last - 1].rate,
      series: churns.map((c) => c.rate),
      churned: churns[last].churned,
      base: churns[last].base,
    },
    trialToPaid: {
      value: trials[last].rate,
      previous: trials[last - 1].rate,
      series: trials.map((t) => t.rate),
      converted: trials[last].converted,
      ended: trials[last].ended,
    },
  }
}
