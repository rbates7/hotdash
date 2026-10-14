import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import {
  activeAt,
  applyDiscounts,
  churnFor,
  computeStripeMetrics,
  convertedFromTrial,
  isPaying,
  grossChargesCents,
  itemMonthlyCents,
  mrrAt,
  payingAt,
  payingCountAt,
  subscriptionMrrCents,
  trialToPaidFor,
  windowsAt,
  type StripeCharge,
  type StripePrice,
  type StripeSubscription,
} from "@/lib/stripe-metrics"

/* ------------------------------------------------------------- builders */

/** Wed 14 Oct 2026, 12:00 Central (17:00 UTC). */
const NOW = new Date("2026-10-14T17:00:00.000Z")
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)
const NOW_SEC = sec(NOW.toISOString())
const DAY = 86_400

function price(overrides: Partial<StripePrice> = {}): StripePrice {
  return {
    currency: "usd",
    unit_amount: 4_900,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    ...overrides,
  }
}

let nextId = 1
/**
 * A subscription that paid its first invoice when it started (or when its
 * trial ended). Pass `first_paid_at: null` for one that has never paid.
 */
function sub(overrides: Partial<StripeSubscription> = {}): StripeSubscription {
  const start = overrides.start_date ?? NOW_SEC - 200 * DAY
  return {
    first_paid_at: Math.max(start, overrides.trial_end ?? 0),
    id: `sub_${nextId++}`,
    status: "active",
    currency: "usd",
    created: start,
    start_date: start,
    trial_start: null,
    trial_end: null,
    ended_at: null,
    canceled_at: null,
    cancellation_details: null,
    items: { data: [{ price: price(), quantity: 1 }] },
    discounts: [],
    ...overrides,
  }
}

function charge(overrides: Partial<StripeCharge> = {}): StripeCharge {
  return {
    id: `ch_${nextId++}`,
    amount: 10_000,
    currency: "usd",
    status: "succeeded",
    captured: true,
    created: NOW_SEC - 60,
    ...overrides,
  }
}

const metrics = (subscriptions: StripeSubscription[], charges: StripeCharge[] = [], timeZone = CENTRAL) =>
  computeStripeMetrics({ subscriptions, charges }, { now: NOW, timeZone })

/* --------------------------------------------------------- active count */

describe("paying subscriber count", () => {
  it("counts not-ended subscriptions that have paid; never-paid and ended ones do not", () => {
    const m = metrics([
      sub({ status: "active" }),
      sub({ status: "active" }),
      sub({ status: "past_due" }),
      sub({ status: "trialing", trial_start: NOW_SEC - DAY, trial_end: NOW_SEC + 13 * DAY, first_paid_at: null }),
      sub({ status: "canceled", ended_at: NOW_SEC - 2 * DAY }),
      sub({ status: "unpaid", first_paid_at: null }),
      sub({ status: "paused", first_paid_at: null }),
      sub({ status: "incomplete", first_paid_at: null }),
      sub({ status: "incomplete_expired", first_paid_at: null, ended_at: NOW_SEC - DAY }),
      sub({ status: "active", first_paid_at: null }), // never paid
    ])
    expect(m.subscribers.value).toBe(3)
  })

  it("previous is the count at the start of the 28-day window", () => {
    const m = metrics([
      sub(), // long-standing
      sub({ start_date: NOW_SEC - 3 * DAY }), // joined inside the window
      sub({ status: "canceled", start_date: NOW_SEC - 100 * DAY, ended_at: NOW_SEC - 5 * DAY }), // left inside it
    ])
    expect(m.subscribers.value).toBe(2)
    expect(m.subscribers.previous).toBe(2) // the long-standing one and the leaver
  })

  it("today is the net change since 00:00 in the founder's zone", () => {
    // 00:00 Central on 14 Oct is 05:00 UTC.
    const m = metrics([
      sub(),
      sub({ start_date: sec("2026-10-14T06:00:00Z") }), // joined today (Central)
      sub({ start_date: sec("2026-10-14T07:00:00Z") }), // joined today
      sub({ status: "canceled", ended_at: sec("2026-10-14T08:00:00Z") }), // left today
      sub({ start_date: sec("2026-10-14T04:00:00Z") }), // 23:00 yesterday Central
    ])
    expect(m.subscribers.today).toBe(1)
    // In UTC the 04:00 sign-up is today too.
    expect(metrics([sub({ start_date: sec("2026-10-14T04:00:00Z") })], [], "UTC").subscribers.today).toBe(1)
  })

  it("a trial converts into the count when it ends, not when it starts", () => {
    const converted = sub({
      start_date: NOW_SEC - 20 * DAY,
      trial_start: NOW_SEC - 20 * DAY,
      trial_end: NOW_SEC - 6 * DAY,
    })
    expect(activeAt(converted, NOW_SEC - 10 * DAY)).toBe(false)
    expect(activeAt(converted, NOW_SEC - 5 * DAY)).toBe(true)
  })

  it("a trial cancelled before it ended was never active", () => {
    const s = sub({
      status: "canceled",
      start_date: NOW_SEC - 20 * DAY,
      trial_start: NOW_SEC - 20 * DAY,
      trial_end: NOW_SEC - 6 * DAY,
      ended_at: NOW_SEC - 10 * DAY,
    })
    for (const t of [NOW_SEC - 15 * DAY, NOW_SEC - 8 * DAY, NOW_SEC]) expect(activeAt(s, t)).toBe(false)
  })

  it("series: six points, the last one is now", () => {
    const m = metrics([sub(), sub({ start_date: NOW_SEC - 20 * DAY })])
    expect(m.subscribers.series).toHaveLength(6)
    expect(m.subscribers.series.at(-1)).toBe(2)
    expect(m.subscribers.series.at(-2)).toBe(1) // the newer one joined inside the current window
  })
})

/* -------------------------------------------------------------- paying */

/** A 100%-off coupon on the subscription now (e.g. a launch annual). */
const FREE = [{ source: { coupon: { percent_off: 100, amount_off: null, duration: "forever" } }, start: NOW_SEC - 30 * DAY }]

describe("isPaying (Bobbi's definition, Oct 14 2026)", () => {
  it("past_due with paid history counts: the customer has not left", () => {
    expect(isPaying(sub({ status: "past_due" }))).toBe(true)
  })

  it("trialing, unpaid and paused count if they have paid before", () => {
    for (const status of ["trialing", "unpaid", "paused"]) {
      expect(isPaying(sub({ status, first_paid_at: NOW_SEC - 60 * DAY })), status).toBe(true)
      expect(isPaying(sub({ status, first_paid_at: null })), `${status}, never paid`).toBe(false)
    }
  })

  it("a never-paid active subscription on a 100% coupon does not count", () => {
    expect(isPaying(sub({ status: "active", first_paid_at: null, discounts: FREE }))).toBe(false)
  })

  it("one that paid once and now sits on a 100% coupon still counts", () => {
    expect(isPaying(sub({ status: "active", first_paid_at: NOW_SEC - 300 * DAY, discounts: FREE }))).toBe(true)
  })

  it("canceled, incomplete_expired and anything with ended_at never count, paid or not", () => {
    expect(isPaying(sub({ status: "canceled", ended_at: NOW_SEC - DAY }))).toBe(false)
    expect(isPaying(sub({ status: "incomplete_expired", ended_at: NOW_SEC - DAY }))).toBe(false)
    expect(isPaying(sub({ status: "incomplete_expired", ended_at: null }))).toBe(false)
    expect(isPaying(sub({ status: "active", ended_at: NOW_SEC - DAY }))).toBe(false)
  })

  it("treats a missing first_paid_at as never paid", () => {
    const { first_paid_at: _omit, ...noField } = sub()
    void _omit
    expect(isPaying(noField)).toBe(false)
  })
})

describe("payingAt (history)", () => {
  it("is paying from the first paid invoice, not from the start or the trial", () => {
    const s = sub({ start_date: NOW_SEC - 40 * DAY, first_paid_at: NOW_SEC - 20 * DAY })
    expect(payingAt(s, NOW_SEC - 30 * DAY)).toBe(false)
    expect(payingAt(s, NOW_SEC - 20 * DAY)).toBe(true)
    expect(payingAt(s, NOW_SEC)).toBe(true)
  })

  it("a canceled payer counted until it ended, then not", () => {
    const s = sub({ status: "canceled", first_paid_at: NOW_SEC - 100 * DAY, ended_at: NOW_SEC - 10 * DAY })
    expect(payingAt(s, NOW_SEC - 50 * DAY)).toBe(true)
    expect(payingAt(s, NOW_SEC - 10 * DAY)).toBe(false)
    expect(payingAt(s, NOW_SEC)).toBe(false)
  })

  it("never-paid and incomplete_expired subscriptions are never in the history", () => {
    const never = sub({ status: "canceled", first_paid_at: null, ended_at: NOW_SEC - DAY })
    const expired = sub({ status: "incomplete_expired", ended_at: NOW_SEC - DAY })
    for (const t of [NOW_SEC - 100 * DAY, NOW_SEC - 2 * DAY, NOW_SEC]) {
      expect(payingAt(never, t)).toBe(false)
      expect(payingAt(expired, t)).toBe(false)
    }
  })

  it("for now it agrees with isPaying", () => {
    const subs = [
      sub(),
      sub({ status: "past_due" }),
      sub({ first_paid_at: null }),
      sub({ status: "trialing", first_paid_at: NOW_SEC - DAY }),
      sub({ status: "canceled", ended_at: NOW_SEC - DAY }),
      sub({ status: "incomplete_expired", ended_at: NOW_SEC - DAY }),
    ]
    expect(payingCountAt(subs, NOW_SEC)).toBe(subs.filter(isPaying).length)
    expect(payingCountAt(subs, NOW_SEC)).toBe(3)
  })

  it("drives previous, today and series on the card", () => {
    const m = metrics([
      sub({ first_paid_at: NOW_SEC - 200 * DAY }),
      sub({ start_date: NOW_SEC - 100 * DAY, first_paid_at: sec("2026-10-14T06:00:00Z") }), // first paid today (Central)
      sub({ start_date: NOW_SEC - 100 * DAY, first_paid_at: null }), // never: not in any point
    ])
    expect(m.subscribers.value).toBe(2)
    expect(m.subscribers.previous).toBe(1)
    expect(m.subscribers.today).toBe(1)
    expect(m.subscribers.series).toEqual([1, 1, 1, 1, 1, 2])
  })
})

/* -------------------------------------------------------------------- MRR */

describe("MRR", () => {
  it("monthly prices count as they are; quantity multiplies", () => {
    expect(itemMonthlyCents({ price: price({ unit_amount: 4_900 }), quantity: 3 })).toBe(14_700)
    expect(itemMonthlyCents({ price: price(), quantity: null })).toBe(4_900)
  })

  it("normalizes yearly, weekly, daily and interval_count to a month", () => {
    const yearly = price({ unit_amount: 48_000, recurring: { interval: "year", interval_count: 1 } })
    expect(itemMonthlyCents({ price: yearly })).toBe(4_000)
    const quarterly = price({ unit_amount: 12_000, recurring: { interval: "month", interval_count: 3 } })
    expect(itemMonthlyCents({ price: quarterly })).toBe(4_000)
    const weekly = price({ unit_amount: 1_200, recurring: { interval: "week", interval_count: 1 } })
    expect(itemMonthlyCents({ price: weekly })).toBeCloseTo(5_200, 6)
    const biweekly = price({ unit_amount: 1_200, recurring: { interval: "week", interval_count: 2 } })
    expect(itemMonthlyCents({ price: biweekly })).toBeCloseTo(2_600, 6)
    const daily = price({ unit_amount: 100, recurring: { interval: "day", interval_count: 1 } })
    expect(itemMonthlyCents({ price: daily })).toBeCloseTo(3_041.67, 1)
  })

  it("skips metered, one-time, unpriced and other-currency items", () => {
    expect(itemMonthlyCents({ price: price({ recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }) })).toBe(0)
    expect(itemMonthlyCents({ price: price({ recurring: null }) })).toBe(0)
    expect(itemMonthlyCents({ price: price({ unit_amount: null }) })).toBe(0)
    expect(itemMonthlyCents({ price: price({ currency: "eur" }) })).toBe(0)
  })

  it("reads unit_amount_decimal when unit_amount is null", () => {
    expect(itemMonthlyCents({ price: price({ unit_amount: null, unit_amount_decimal: "4950.5" }) })).toBe(4_950.5)
  })

  it("applies percent-off and amount-off discounts, never below zero", () => {
    const pct = { source: { coupon: { percent_off: 20, amount_off: null, duration: "forever" } } }
    expect(applyDiscounts(10_000, [pct], 1, NOW_SEC)).toBe(8_000)
    const off = { source: { coupon: { percent_off: null, amount_off: 1_500, currency: "usd", duration: "repeating" } } }
    expect(applyDiscounts(10_000, [off], 1, NOW_SEC)).toBe(8_500)
    // An amount off a yearly invoice is spread over its 12 months.
    expect(applyDiscounts(4_000, [off], 12, NOW_SEC)).toBe(3_875)
    const huge = { coupon: { percent_off: null, amount_off: 99_999, currency: "usd", duration: "forever" } }
    expect(applyDiscounts(10_000, [huge], 1, NOW_SEC)).toBe(0)
  })

  it("ignores once-only, expired, future and unexpanded discounts", () => {
    const once = { source: { coupon: { percent_off: 50, amount_off: null, duration: "once" } } }
    const expired = { source: { coupon: { percent_off: 50, amount_off: null, duration: "repeating" } }, end: NOW_SEC - 1 }
    const future = { source: { coupon: { percent_off: 50, amount_off: null, duration: "forever" } }, start: NOW_SEC + DAY }
    expect(applyDiscounts(10_000, [once, expired, future, "di_123", { source: { coupon: "co_123" } }], 1, NOW_SEC)).toBe(10_000)
  })

  it("sums items, then the subscription-level discount", () => {
    const s = sub({
      items: {
        data: [
          { price: price({ unit_amount: 5_000 }), quantity: 2 },
          { price: price({ unit_amount: 2_000 }), discounts: [{ source: { coupon: { percent_off: 50, amount_off: null, duration: "forever" } } }] },
        ],
      },
      discounts: [{ source: { coupon: { percent_off: 10, amount_off: null, duration: "forever" } } }],
    })
    expect(subscriptionMrrCents(s, NOW_SEC)).toBe(9_900) // (10,000 + 1,000) × 0.9
  })

  it("is the sum over paying subscriptions, in dollars", () => {
    const subs = [
      sub(), // $49
      sub({ status: "past_due" }), // $49
      sub({ items: { data: [{ price: price({ unit_amount: 46_800, recurring: { interval: "year", interval_count: 1 } }) }] } }), // $39
      sub({ status: "trialing", trial_start: NOW_SEC - DAY, trial_end: NOW_SEC + DAY, first_paid_at: null }),
      sub({ status: "canceled", ended_at: NOW_SEC - DAY }),
    ]
    expect(mrrAt(subs, NOW_SEC)).toBe(137)
    const m = metrics(subs)
    expect(m.mrr.value).toBe(137)
    // 28 days ago the canceled one was still paying.
    expect(m.mrr.previous).toBe(186)
    expect(m.mrr.series).toHaveLength(6)
    expect(m.mrr.series.at(-1)).toBe(137)
  })
})

describe("MRR uses only the paying set", () => {
  it("leaves out never-paid subscriptions, even active at full price", () => {
    const subs = [
      sub(), // $49, paying
      sub({ status: "past_due" }), // $49, paying
      sub({ first_paid_at: null }), // active, never paid, no coupon now: $0 of MRR
      sub({ status: "trialing", first_paid_at: null }),
      sub({ status: "unpaid", first_paid_at: NOW_SEC - 90 * DAY }), // paid before: in, like Subscribers
    ]
    expect(mrrAt(subs, NOW_SEC)).toBe(147)
    expect(metrics(subs).mrr.value).toBe(147)
  })

  it("a paid-once subscription now on a 100% coupon counts as a subscriber at $0", () => {
    const m = metrics([sub(), sub({ first_paid_at: NOW_SEC - 300 * DAY, discounts: FREE })])
    expect(m.subscribers.value).toBe(2)
    expect(m.mrr.value).toBe(49)
  })

  it("is USD only: a paying EUR subscription is a subscriber but adds nothing", () => {
    const m = metrics([sub(), sub({ currency: "eur", items: { data: [{ price: price({ currency: "eur" }) }] } })])
    expect(m.subscribers.value).toBe(2)
    expect(m.mrr.value).toBe(49)
  })

  it("past points count a subscription only from its first payment", () => {
    const late = sub({ start_date: NOW_SEC - 100 * DAY, first_paid_at: NOW_SEC - 10 * DAY })
    expect(mrrAt([late], NOW_SEC - 20 * DAY)).toBe(0)
    expect(mrrAt([late], NOW_SEC)).toBe(49)
  })
})

/* ------------------------------------------------------------------ churn */

describe("churn", () => {
  const w = { startSec: NOW_SEC - 28 * DAY, endSec: NOW_SEC }

  it("is ended / active at the window's start", () => {
    const subs = [
      sub(),
      sub(),
      sub(),
      sub({ status: "canceled", ended_at: NOW_SEC - 3 * DAY }),
      // Payment failures count: involuntary churn is churn.
      sub({ status: "canceled", ended_at: NOW_SEC - 4 * DAY, cancellation_details: { reason: "payment_failed" } }),
    ]
    expect(churnFor(subs, w)).toEqual({ churned: 2, base: 5, rate: 40 })
  })

  it("leaves out subscriptions that started inside the window, and ones that ended before it", () => {
    const subs = [
      sub(),
      sub({ status: "canceled", start_date: NOW_SEC - 10 * DAY, ended_at: NOW_SEC - 2 * DAY }),
      sub({ status: "canceled", ended_at: NOW_SEC - 60 * DAY }),
    ]
    expect(churnFor(subs, w)).toEqual({ churned: 0, base: 1, rate: 0 })
  })

  it("is null, not 0%, with nobody at the start", () => {
    expect(churnFor([sub({ start_date: NOW_SEC - DAY })], w)).toEqual({ churned: 0, base: 0, rate: null })
    const m = metrics([])
    expect(m.churn.value).toBeNull()
    expect(m.churn.series.every((r) => r === null)).toBe(true)
  })

  it("rounds to one decimal and reports the current and prior window", () => {
    const subs = [
      ...Array.from({ length: 2 }, () => sub()),
      sub({ status: "canceled", ended_at: NOW_SEC - 2 * DAY }),
      sub({ status: "canceled", ended_at: NOW_SEC - 40 * DAY }),
    ]
    const m = metrics(subs)
    expect(m.churn.value).toBe(33.3)
    expect(m.churn.churned).toBe(1)
    expect(m.churn.base).toBe(3)
    expect(m.churn.previous).toBe(25)
  })
})

/* ---------------------------------------------------------- trial-to-paid */

describe("trial-to-paid", () => {
  const w = { startSec: NOW_SEC - 28 * DAY, endSec: NOW_SEC }
  const trial = (endedDaysAgo: number, overrides: Partial<StripeSubscription> = {}) =>
    sub({
      start_date: NOW_SEC - (endedDaysAgo + 14) * DAY,
      trial_start: NOW_SEC - (endedDaysAgo + 14) * DAY,
      trial_end: NOW_SEC - endedDaysAgo * DAY,
      ...overrides,
    })

  it("is converted / trials that ended in the window", () => {
    const subs = [
      trial(3), // active: converted
      trial(5), // active: converted
      trial(6, { status: "canceled", ended_at: NOW_SEC - 6 * DAY }), // ended with the trial
      trial(8, { status: "past_due" }), // first invoice failing: not yet
      trial(40), // ended before the window
      sub({ status: "trialing", trial_start: NOW_SEC - DAY, trial_end: NOW_SEC + 13 * DAY }), // still running
      sub(), // never had a trial
    ]
    expect(trialToPaidFor(subs, w)).toEqual({ converted: 2, ended: 4, rate: 50 })
  })

  it("counts a trial cancelled early as ended, in the window it was cancelled", () => {
    const s = trial(-5, { status: "canceled", ended_at: NOW_SEC - 2 * DAY })
    expect(trialToPaidFor([s], w)).toEqual({ converted: 0, ended: 1, rate: 0 })
  })

  it("converted-then-cancelled counts as converted; dropped for a failed first payment does not", () => {
    const paidThenLeft = trial(20, { status: "canceled", ended_at: NOW_SEC - 2 * DAY, cancellation_details: { reason: "cancellation_requested" } })
    const dunned = trial(20, { status: "canceled", ended_at: NOW_SEC - 2 * DAY, cancellation_details: { reason: "payment_failed" } })
    expect(convertedFromTrial(paidThenLeft)).toBe(true)
    expect(convertedFromTrial(dunned)).toBe(false)
    expect(trialToPaidFor([paidThenLeft, dunned], w)).toEqual({ converted: 1, ended: 2, rate: 50 })
  })

  it("is null with no trials ending", () => {
    expect(metrics([sub()]).trialToPaid).toMatchObject({ value: null, converted: 0, ended: 0 })
  })
})

/* ------------------------------------------------------------------- cash */

describe("cash this week", () => {
  // Monday 12 Oct 2026, 00:00 Central = 05:00 UTC.
  const MONDAY = sec("2026-10-12T05:00:00Z")

  it("sums gross succeeded, captured, USD charges since Monday 00:00 in the zone", () => {
    const charges = [
      charge({ amount: 4_900, created: MONDAY }), // the first second counts
      charge({ amount: 9_900, created: NOW_SEC - 3_600 }),
      charge({ amount: 1_000, created: MONDAY - 1 }), // Sunday 23:59:59
      charge({ amount: 5_000, status: "failed" }),
      charge({ amount: 5_000, status: "pending" }),
      charge({ amount: 5_000, captured: false }), // authorized only
      charge({ amount: 5_000, currency: "eur" }),
    ]
    const m = metrics([], charges)
    expect(m.cashThisWeek.value).toBe(148)
    expect(m.cashThisWeek.since).toBe("2026-10-12T05:00:00.000Z")
  })

  it("is gross: a refunded charge still counts in full", () => {
    expect(grossChargesCents([charge({ amount: 4_900 })], NOW_SEC - 100, NOW_SEC + 1)).toBe(4_900)
  })

  it("previous is last week from Monday to the same point in the week", () => {
    const week = 7 * DAY
    const charges = [
      charge({ amount: 2_000, created: MONDAY - week }), // last Monday 00:00
      charge({ amount: 3_000, created: NOW_SEC - week - 60 }), // just before the same point
      charge({ amount: 7_000, created: NOW_SEC - week + 3_600 }), // after it: not comparable yet
    ]
    expect(metrics([], charges).cashThisWeek.previous).toBe(50)
  })

  it("follows the zone: in UTC the week started 5 hours earlier", () => {
    const charges = [charge({ amount: 1_000, created: sec("2026-10-12T02:00:00Z") })]
    expect(metrics([], charges, CENTRAL).cashThisWeek.value).toBe(0)
    expect(metrics([], charges, "UTC").cashThisWeek.value).toBe(10)
  })

  it("is a real 0 when nothing came in (Stripe answered; the week is empty)", () => {
    expect(metrics([], []).cashThisWeek).toMatchObject({ value: 0, previous: 0 })
  })
})

/* -------------------------------------------------------------- windows */

describe("windowsAt", () => {
  it("six back-to-back 28-day windows, the last cut off at now", () => {
    const ws = windowsAt(NOW, CENTRAL)
    expect(ws).toHaveLength(6)
    expect(ws.at(-1)!.endSec).toBe(NOW_SEC)
    // Current window: 17 Sep 00:00 Central (05:00 UTC) to now.
    expect(ws.at(-1)!.startSec).toBe(sec("2026-09-17T05:00:00Z"))
    for (let i = 1; i < ws.length; i++) expect(ws[i].startSec).toBe(ws[i - 1].endSec)
  })
})
