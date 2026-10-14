import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import { computeStripeMetrics, isPaying, type StripeSubscription } from "@/lib/stripe-metrics"
import R from "@/lib/__fixtures__/stripe-reconcile-2026-10-14.json"

/**
 * Bobbi's reconciliation (Data, Oct 14 2026) as a synthetic Stripe: one
 * made-up subscription per real one in each category she counted, so the
 * dashboard's definition must land on her headline, and Coulson's older
 * method on his 1,156, from the same list. No real Stripe data.
 */

const NOW = new Date("2026-10-14T13:00:00.000Z") // ~8 AM CT
const NOW_SEC = NOW.getTime() / 1000
const DAY = 86_400

/** A 100%-off coupon on the subscription now. */
const FREE = [{ source: { coupon: { percent_off: 100, amount_off: null, duration: "forever" } }, start: NOW_SEC - 60 * DAY }]

let nextId = 1
function subs(count: number, overrides: Partial<StripeSubscription>): StripeSubscription[] {
  return Array.from({ length: count }, () => ({
    id: `sub_r${nextId++}`,
    status: "active",
    currency: "usd",
    created: NOW_SEC - 300 * DAY,
    start_date: NOW_SEC - 300 * DAY,
    trial_start: null,
    trial_end: null,
    ended_at: null,
    items: { data: [{ price: { currency: "usd", unit_amount: 4_900, recurring: { interval: "month", interval_count: 1 } } }] },
    discounts: [],
    first_paid_at: NOW_SEC - 300 * DAY,
    ...overrides,
  }))
}

const paidActive = R.paying.active - R.paid_once_now_100pct_coupon
const neverPaidActiveFree = R.never_paid_not_ended.active - R.never_paid_active_no_current_coupon

const FIXTURE: StripeSubscription[] = [
  ...subs(paidActive, {}),
  ...subs(R.paid_once_now_100pct_coupon, { discounts: FREE }), // "Curt-type": paid once, free now
  ...subs(R.paying.past_due, { status: "past_due" }),
  ...subs(neverPaidActiveFree, { first_paid_at: null, discounts: FREE }),
  // Launch annuals whose one-time 100% coupon has dropped off; never charged yet.
  ...subs(R.never_paid_active_no_current_coupon, { first_paid_at: null }),
  ...subs(R.never_paid_not_ended.trialing, {
    status: "trialing",
    first_paid_at: null,
    trial_start: NOW_SEC - 3 * DAY,
    trial_end: NOW_SEC + 11 * DAY,
  }),
  ...subs(R.never_paid_not_ended.past_due, { status: "past_due", first_paid_at: null }),
  // Ended ones: paid, then left. Never in either count.
  ...subs(40, { status: "canceled", ended_at: NOW_SEC - 20 * DAY, canceled_at: NOW_SEC - 20 * DAY }),
  ...subs(5, { status: "canceled", ended_at: NOW_SEC - 2 * DAY, discounts: FREE }),
  ...subs(3, { status: "incomplete_expired", first_paid_at: null, ended_at: NOW_SEC - 5 * DAY }),
]

const hasFullCouponNow = (s: StripeSubscription) =>
  (s.discounts ?? []).some((d) => typeof d !== "string" && typeof d.source?.coupon === "object" && d.source.coupon?.percent_off === 100)

/** Coulson's method, inferred by Bobbi: status=active minus subs on a 100%-off coupon now. */
const coulson = (list: StripeSubscription[]) => list.filter((s) => s.status === "active" && !hasFullCouponNow(s)).length

describe("reconciliation with Bobbi's Oct 14 counts", () => {
  it("the fixture has every category she counted", () => {
    expect(FIXTURE.filter((s) => s.ended_at === null).length).toBe(R.all_not_ended_any_status)
    expect(FIXTURE.filter((s) => s.status === "active").length).toBe(R.coulson.status_active)
    expect(FIXTURE.filter((s) => s.status === "active" && hasFullCouponNow(s)).length).toBe(R.coulson.active_with_100pct_coupon)
  })

  it("Subscribers is the 1,110 headline: active and past_due that have paid", () => {
    const m = computeStripeMetrics({ subscriptions: FIXTURE, charges: [] }, { now: NOW, timeZone: CENTRAL })
    expect(m.subscribers.value).toBe(1110)
    expect(m.subscribers.value).toBe(R.paying.headline)
    expect(FIXTURE.filter((s) => isPaying(s) && s.status === "active").length).toBe(1079)
  })

  it("Coulson's old method gives 1,156 on the same list, and the bridge explains the gap", () => {
    expect(coulson(FIXTURE)).toBe(1156)
    expect(coulson(FIXTURE)).toBe(R.coulson.result)

    const paying = FIXTURE.filter(isPaying)
    const pastDue = paying.filter((s) => s.status === "past_due").length
    const neverPaidActiveNoCoupon = FIXTURE.filter(
      (s) => s.status === "active" && !isPaying(s) && !hasFullCouponNow(s)
    ).length
    const paidButFreeNow = paying.filter((s) => s.status === "active" && hasFullCouponNow(s)).length
    expect([-pastDue, neverPaidActiveNoCoupon, -paidButFreeNow]).toEqual([
      R.bridge_to_coulson.remove_past_due,
      R.bridge_to_coulson.add_never_paid_active_no_current_coupon,
      R.bridge_to_coulson.remove_paid_before_now_on_100pct_coupon,
    ])
    expect(paying.length - pastDue + neverPaidActiveNoCoupon - paidButFreeNow).toBe(1156)
  })
})
