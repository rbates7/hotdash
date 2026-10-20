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
  /** Shown as the plan name in the New/Churned lists; never used in a figure. */
  nickname?: string | null
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
  /**
   * The Stripe customer id (`cus_…`), only so the gated New/Churned lists
   * can look the name and email up on demand. No customer data is kept.
   */
  customer?: string | null
}

/** A paid invoice: only what revenue reads. */
export type StripeInvoice = {
  /** Minor units (cents). */
  amount_paid: number
  currency: string
  /** When it was paid (`status_transitions.paid_at`, else `created`), unix seconds. */
  paid_at: number
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
  /** Every paid invoice. Absent in older test data: revenue is then 0. */
  invoices?: StripeInvoice[]
}

/* ---------------------------------------------------------------- output */

/** `null` means there was nothing to divide by — never a made-up 0. */
export type Rate = number | null

/** A count now, with its history on the 28-day windows. */
export type CountSeries = {
  value: number
  /** At the start of the 28-day window. */
  previous: number
  /** Net change since 00:00 today in the founder's zone. */
  today: number
  /** At the end of each of six 28-day windows, oldest first. */
  series: number[]
}

export type StripeMetrics = {
  /**
   * Stripe paying subscriptions (`isPaying`): group (1) of the Subscribers
   * total, not the total itself (`subscriberTotal` adds the rest).
   */
  subscribers: CountSeries
  /** Free accounts (`isFreeAccount`): group (3) of the Subscribers total. */
  freeAccounts: CountSeries
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
  /**
   * Paid-once subscriptions whose renewal is failing (`past_due`) now, and
   * their monthly-equivalent revenue at risk in dollars. Not in
   * `subscribers` or `mrr`. No history: Stripe cannot date a past due spell.
   */
  pastDue: { value: number; mrr: number }
  /** `mrr` × 12, at the same points. */
  arr: { value: number; previous: number; series: number[] }
  /** Paid invoices (USD, gross of refunds) per 28-day window, in dollars; `invoices` counts the current one. */
  revenue: { value: number; previous: number; series: number[]; invoices: number }
  /** MRR ÷ Stripe paying subscribers, dollars; null when there are none. */
  arpu: { value: number | null; previous: number | null }
  /** ARPU ÷ monthly churn, dollars; null when churn is 0 or unknown. */
  ltv: { value: number | null; previous: number | null }
  /**
   * Net revenue retention, %: the MRR at a window's end of the subscribers
   * paying at its start, over their MRR at its start. `basis` says how it
   * was priced: Stripe has no price history, so both ends use today's prices.
   */
  nrr: { value: Rate; previous: Rate; series: Rate[]; basis: "current_prices" }
  /** Trials started on each day of the current 28-day window (founder's zone), oldest first. */
  trialsStartedPerDay: { series: TrialDay[]; total: number; previousTotal: number }
}

/** One founder-zone day: `date` is YYYY-MM-DD. */
export type TrialDay = { date: string; count: number }

/**
 * The fields #77 added, optional to a reader: a cached older shape during a
 * deploy still parses, and that card shows an em dash.
 */
export type StripeMetricExtras = Partial<
  Pick<StripeMetrics, "pastDue" | "arr" | "revenue" | "arpu" | "ltv" | "nrr" | "trialsStartedPerDay">
>

/* ------------------------------------------------------------ definitions */

const SECOND = 1000

/**
 * Statuses that count as an active subscription for Subscribers, MRR,
 * churn and their history: `active` only (Rashad via Coulson, Oct 20 2026,
 * replacing Oct 14's active + past_due). `past_due` (a renewal failing,
 * Stripe still retrying) is its own figure, `pastDue`. `trialing` is
 * measured by trial-to-paid. `unpaid`, `paused`, `incomplete*` and
 * `canceled` are not active.
 */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["active"])
export const PAST_DUE_STATUSES: ReadonlySet<string> = new Set(["past_due"])
/** The statuses `isCounted` allows: `ACTIVE_STATUSES`. */
export const COUNTED_STATUSES = ACTIVE_STATUSES

export function isCounted(sub: Pick<StripeSubscription, "status">) {
  return COUNTED_STATUSES.has(sub.status)
}

/**
 * A paying Stripe subscriber now (Oct 14 2026 definition, narrowed to
 * `active` only on Oct 20): status `active` **and** at least one paid
 * invoice with `amount_paid > 0`. `trialing`, `unpaid` and `paused` do not
 * count, paid before or not. No "has a coupon now" filter: a launch annual
 * that paid once and now sits on a coupon still counts. Group (1) of the
 * Subscribers total; MRR is computed over this set only.
 */
export function isPaying(sub: Pick<StripeSubscription, "status" | "first_paid_at">) {
  return isCounted(sub) && sub.first_paid_at != null
}

/** Paid at least once and `past_due` now: the `pastDue` figure, never in `isPaying`. */
export function isPastDue(sub: Pick<StripeSubscription, "status" | "first_paid_at">) {
  return PAST_DUE_STATUSES.has(sub.status) && sub.first_paid_at != null
}

/**
 * Whether `sub` was a paying subscriber at `atSec`. Stripe keeps no status
 * history, so this reads timestamps: from its first paid invoice until it
 * ended. Only subscriptions that are paying now, or have since been
 * canceled, are in the history; one sitting in `unpaid`, `paused` or
 * `trialing` now cannot be dated, so it is left out of every point. For
 * now it agrees with `isPaying`.
 */
export function payingAt(sub: StripeSubscription, atSec: number) {
  if (sub.first_paid_at == null) return false
  if (!isCounted(sub) && sub.status !== "canceled") return false
  return sub.first_paid_at <= atSec && (sub.ended_at == null || atSec < sub.ended_at)
}

export function payingCountAt(subs: readonly StripeSubscription[], atSec: number) {
  return subs.filter((s) => payingAt(s, atSec)).length
}

/**
 * A free account now (group (3) of the Subscribers total): status exactly
 * `active` and **never** paid an invoice with `amount_paid > 0` — a
 * 100%-off launch annual, or one whose coupon has since dropped off but
 * has not been charged yet. Whether a coupon is on it now does not
 * matter. Never-paid `trialing` and `past_due` are not free accounts.
 */
export function isFreeAccount(sub: Pick<StripeSubscription, "status" | "first_paid_at">) {
  return sub.status === "active" && sub.first_paid_at == null
}

/**
 * Whether `sub` was a free account at `atSec`, best effort: from the end
 * of any trial until it first paid (when it moves to paying) or ended.
 * Only subscriptions `active` now or since canceled (not for a failed
 * payment — those were past due, not free) are in the history. For now
 * it agrees with `isFreeAccount`.
 */
export function freeAt(sub: StripeSubscription, atSec: number) {
  if (sub.status !== "active" && sub.status !== "canceled") return false
  if (sub.cancellation_details?.reason === "payment_failed") return false
  const from = paidFrom(sub)
  const until = Math.min(sub.first_paid_at ?? Infinity, sub.ended_at ?? Infinity)
  return from <= atSec && atSec < until
}

export function freeCountAt(subs: readonly StripeSubscription[], atSec: number) {
  return subs.filter((s) => freeAt(s, atSec)).length
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
 * MRR at `atSec`: every Stripe subscription paying then (`payingAt` —
 * group (1) of Subscribers only: not free accounts, not App Store), USD
 * only, at its
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

/* ---------------------------------------------------------------- revenue */

/** Paid invoices in the reporting currency with `paid_at` in `[fromSec, toSec)`, cents and count. */
export function paidInvoicesIn(invoices: readonly StripeInvoice[], fromSec: number, toSec: number) {
  let cents = 0
  let count = 0
  for (const inv of invoices) {
    if (!(inv.amount_paid > 0) || inv.currency.toLowerCase() !== REPORTING_CURRENCY) continue
    if (inv.paid_at < fromSec || inv.paid_at >= toSec) continue
    cents += inv.amount_paid
    count += 1
  }
  return { cents, count }
}

/* ---------------------------------------------------- derived money figures */

const round2 = (n: number) => Math.round(n * 100) / 100

/** MRR ÷ paying subscribers; null when there are none. */
export function arpuOf(mrr: number, subscribers: number): number | null {
  return subscribers > 0 ? round2(mrr / subscribers) : null
}

/** Days per average month, to turn 28-day churn into monthly churn. */
const DAYS_PER_MONTH = 365.25 / 12

/**
 * Lifetime value: ARPU ÷ monthly churn, where monthly churn is the 28-day
 * churn rate scaled to an average month (× 30.44 / 28). Null when either is
 * unknown or churn is 0 (an endless lifetime is not a figure).
 */
export function ltvOf(arpu: number | null, churnPct: Rate): number | null {
  if (arpu === null || churnPct === null || churnPct <= 0) return null
  const monthly = (churnPct / 100) * (DAYS_PER_MONTH / PERIOD_DAYS)
  return round2(arpu / Math.min(1, monthly))
}

/**
 * Net revenue retention over a window: the subscriptions paying at its
 * start (`payingAt`), their MRR at its end (0 once ended) over their MRR at
 * its start, in %. Today's prices at both ends (no price history), so only
 * churn, quantity and discount changes move it. Null with no MRR at start.
 */
export function nrrFor(subs: readonly StripeSubscription[], w: Window): Rate {
  let start = 0
  let end = 0
  for (const s of subs) {
    if (!payingAt(s, w.startSec)) continue
    start += subscriptionMrrCents(s, w.startSec)
    if (payingAt(s, w.endSec)) end += subscriptionMrrCents(s, w.endSec)
  }
  return start > 0 ? Math.round((end / start) * 1000) / 10 : null
}

/**
 * Trials started per day: subscriptions whose `trial_start` falls on each
 * of the `days` founder-zone days ending today, whatever happened to the
 * trial since. Oldest first.
 */
export function trialsStartedByDay(
  subs: readonly StripeSubscription[],
  now: Date,
  timeZone: string,
  days = PERIOD_DAYS
) {
  const today = todayIn(now, timeZone)
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)))
  const bounds = dates.map((d) => toSec(startOfDay(d, timeZone)))
  const endSec = toSec(startOfDay(addDays(today, 1), timeZone))
  const counts = dates.map(() => 0)
  for (const s of subs) {
    const t = s.trial_start
    if (t === null || t < bounds[0] || t >= endSec) continue
    let i = bounds.length - 1
    while (i > 0 && t < bounds[i]) i -= 1
    counts[i] += 1
  }
  return dates.map((date, i) => ({ date: String(date), count: counts[i] }))
}

/** Trials started in `[fromSec, toSec)`. */
export function trialsStartedIn(subs: readonly StripeSubscription[], fromSec: number, toSec: number) {
  return subs.filter((s) => s.trial_start !== null && s.trial_start >= fromSec && s.trial_start < toSec).length
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

  const todayStart = toSec(startOfDay(todayIn(now, timeZone), timeZone))
  const countSeries = (isNow: (s: StripeSubscription) => boolean, countAt: typeof payingCountAt): CountSeries => {
    const value = subs.filter(isNow).length
    return {
      value,
      previous: countAt(subs, current.startSec),
      today: value - countAt(subs, todayStart),
      series: windows.map((w, i) => (i === windows.length - 1 ? value : countAt(subs, w.endSec))),
    }
  }

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

  const mrrSeries = windows.map((w) => mrrAt(subs, w.endSec))
  const mrrNow = mrrAt(subs, nowSec)
  const mrrPrev = mrrAt(subs, prior.endSec)
  const paying = subs.filter(isPaying).length
  const payingPrev = payingCountAt(subs, prior.endSec)
  const pastDueSubs = subs.filter(isPastDue)
  const invoices = data.invoices ?? []
  const revenues = windows.map((w, i) => paidInvoicesIn(invoices, w.startSec, i === last ? nowSec + 1 : w.endSec))
  const nrrs = windows.map((w) => nrrFor(subs, w))
  const arpu = arpuOf(mrrNow, paying)
  const arpuPrev = arpuOf(mrrPrev, payingPrev)
  const byDay = trialsStartedByDay(subs, now, timeZone)
  const firstDaySec = toSec(startOfDay(addDays(todayIn(now, timeZone), -(PERIOD_DAYS - 1)), timeZone))

  return {
    subscribers: countSeries(isPaying, payingCountAt),
    freeAccounts: countSeries(isFreeAccount, freeCountAt),
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
    pastDue: {
      value: pastDueSubs.length,
      mrr: Math.round(pastDueSubs.reduce((sum, s) => sum + subscriptionMrrCents(s, nowSec), 0)) / 100,
    },
    arr: { value: round2(mrrNow * 12), previous: round2(mrrPrev * 12), series: mrrSeries.map((m) => round2(m * 12)) },
    revenue: {
      value: revenues[last].cents / 100,
      previous: revenues[last - 1].cents / 100,
      series: revenues.map((r) => r.cents / 100),
      invoices: revenues[last].count,
    },
    arpu: { value: arpu, previous: arpuPrev },
    ltv: { value: ltvOf(arpu, churns[last].rate), previous: ltvOf(arpuPrev, churns[last - 1].rate) },
    nrr: { value: nrrs[last], previous: nrrs[last - 1], series: nrrs, basis: "current_prices" },
    trialsStartedPerDay: {
      series: byDay,
      total: byDay.reduce((sum, d) => sum + d.count, 0),
      previousTotal: trialsStartedIn(
        subs,
        toSec(startOfDay(addDays(todayIn(now, timeZone), -(2 * PERIOD_DAYS - 1)), timeZone)),
        firstDaySec
      ),
    },
  }
}
