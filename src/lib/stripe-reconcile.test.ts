// @vitest-environment node
import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import { createAppStoreSource } from "@/lib/server/app-store"
import { computeStripeMetrics, isFreeAccount, isPaying, type StripeSubscription } from "@/lib/stripe-metrics"
import { subscriberTotal } from "@/lib/subscriber-total"
import R from "@/lib/__fixtures__/stripe-reconcile-2026-10-14.json"

/**
 * Bobbi's reconciliation (Data, Oct 14 2026) as a synthetic Stripe: one
 * made-up subscription per real one in each category she counted, so the
 * dashboard's definitions must land on her headlines — 1,110 paying, 174
 * free, plus the App Store's 53 from a mocked provider: 1,337 — and
 * Coulson's older method on his 1,156, from the same list. No real Stripe
 * data, no database.
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

  it("Stripe paying is the 1,110 headline: active and past_due that have paid", () => {
    const m = computeStripeMetrics({ subscriptions: FIXTURE, charges: [] }, { now: NOW, timeZone: CENTRAL })
    expect(m.subscribers.value).toBe(1110)
    expect(m.subscribers.value).toBe(R.paying.headline)
    expect(FIXTURE.filter((s) => isPaying(s) && s.status === "active").length).toBe(1079)
  })

  it("Free accounts are the 174 active subscriptions that never paid, coupon or not", () => {
    const m = computeStripeMetrics({ subscriptions: FIXTURE, charges: [] }, { now: NOW, timeZone: CENTRAL })
    expect(m.freeAccounts.value).toBe(174)
    expect(m.freeAccounts.value).toBe(R.free_never_paid_active)
    expect(FIXTURE.filter((s) => isFreeAccount(s) && isPaying(s))).toHaveLength(0)
    // Never-paid trialing and past_due are in neither group.
    const neither = FIXTURE.filter((s) => s.ended_at === null && !isPaying(s) && !isFreeAccount(s))
    expect(neither).toHaveLength(R.never_paid_not_ended.trialing + R.never_paid_not_ended.past_due)
  })

  it("the total is 1,337 = 1,110 + 53 + 174, with the App Store from a mocked provider", async () => {
    const appStore = createAppStoreSource({
      env: () => ({ SUPABASE_READONLY_DB_URL: "postgresql://ro:fake@127.0.0.1:5432/postgres" }),
      query: async () => R.app_store.payers_not_in_stripe,
      clock: () => NOW.getTime(),
    })
    const m = computeStripeMetrics({ subscriptions: FIXTURE, charges: [] }, { now: NOW, timeZone: CENTRAL })
    const total = subscriberTotal(m, await appStore.read())
    expect([total.stripePaying, total.appStore, total.freeAccounts]).toEqual([1110, 53, 174])
    expect(total.value).toBe(1337)
    expect(total.value).toBe(R.total_headline)

    // The App Store not connected: the total leaves it out, never counts it as 0 payers.
    const off = createAppStoreSource({ env: () => ({}) })
    const without = subscriberTotal(m, await off.read())
    expect(without.appStore).toBeNull()
    expect(without.value).toBe(1110 + 174)
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
