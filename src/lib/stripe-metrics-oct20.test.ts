import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import {
  ACTIVE_STATUSES,
  COUNTED_STATUSES,
  arpuOf,
  churnFor,
  computeStripeMetrics,
  isPastDue,
  isPaying,
  ltvOf,
  nrrFor,
  paidInvoicesIn,
  trialsStartedByDay,
  windowsAt,
  type StripeInvoice,
  type StripePrice,
  type StripeSubscription,
} from "@/lib/stripe-metrics"
import { parseStripeSummary } from "@/lib/stripe-summary"
import { LIVE_METRICS, liveSummary } from "@/test/stripe-fixture"

/** Wed 14 Oct 2026, 12:00 Central. */
const NOW = new Date("2026-10-14T17:00:00.000Z")
const NOW_SEC = Math.floor(NOW.getTime() / 1000)
const DAY = 86_400
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)

const price = (o: Partial<StripePrice> = {}): StripePrice => ({
  currency: "usd",
  unit_amount: 4_900,
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  ...o,
})
let n = 1
function sub(o: Partial<StripeSubscription> = {}): StripeSubscription {
  const start = o.start_date ?? NOW_SEC - 200 * DAY
  return {
    id: `sub_${n++}`,
    first_paid_at: Math.max(start, o.trial_end ?? 0),
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
    ...o,
  }
}
const inv = (dollars: number, paidAt: number, currency = "usd"): StripeInvoice => ({
  amount_paid: Math.round(dollars * 100),
  currency,
  paid_at: paidAt,
})
const metrics = (subscriptions: StripeSubscription[], invoices?: StripeInvoice[], timeZone = CENTRAL) =>
  computeStripeMetrics({ subscriptions, charges: [], invoices }, { now: NOW, timeZone })

describe("active / pastDue split (Rashad via Coulson, Oct 20)", () => {
  it("active is the only counted status", () => {
    expect([...ACTIVE_STATUSES]).toEqual(["active"])
    expect(COUNTED_STATUSES).toBe(ACTIVE_STATUSES)
  })

  it("past_due that has paid is pastDue, never paying; never-paid past_due is neither", () => {
    expect(isPastDue(sub({ status: "past_due" }))).toBe(true)
    expect(isPaying(sub({ status: "past_due" }))).toBe(false)
    expect(isPastDue(sub({ status: "past_due", first_paid_at: null }))).toBe(false)
    expect(isPastDue(sub({ status: "active" }))).toBe(false)
  })

  it("subscribers, MRR and the churn base leave past_due out; pastDue carries its count and MRR", () => {
    const yearly = price({ unit_amount: 46_800, recurring: { interval: "year", interval_count: 1 } })
    const m = metrics([
      sub(),
      sub({ status: "past_due" }),
      sub({ status: "past_due", items: { data: [{ price: yearly }] } }),
      sub({ status: "past_due", first_paid_at: null }),
    ])
    expect(m.subscribers.value).toBe(1)
    expect(m.mrr.value).toBe(49)
    expect(m.mrr.series.every((v) => v === 49)).toBe(true)
    expect(m.churn.base).toBe(1)
    expect(m.pastDue).toEqual({ value: 2, mrr: 88 })
  })

  it("a past_due subscription is not in the churn base of any window", () => {
    const w = windowsAt(NOW, CENTRAL).at(-1)!
    expect(churnFor([sub({ status: "past_due" })], w).base).toBe(0)
  })
})

describe("arr", () => {
  it("is MRR × 12 at every point", () => {
    const m = metrics([sub(), sub({ status: "canceled", ended_at: NOW_SEC - 2 * DAY })])
    expect(m.arr.value).toBe(588)
    expect(m.arr.previous).toBe(m.mrr.previous * 12)
    expect(m.arr.series).toEqual(m.mrr.series.map((v) => v * 12))
  })
})

describe("revenue (paid invoices per 28-day window)", () => {
  it("sums USD paid invoices in [from, to), skipping other currencies and zero amounts", () => {
    const list = [inv(10, 100), inv(5, 199), inv(7, 200), inv(99, 150, "eur"), inv(0, 150)]
    expect(paidInvoicesIn(list, 100, 200)).toEqual({ cents: 1_500, count: 2 })
  })

  it("value is the current window up to now, previous the window before, six points", () => {
    const w = windowsAt(NOW, CENTRAL)
    const m = metrics(
      [sub()],
      [inv(100, NOW_SEC - DAY), inv(20.5, NOW_SEC), inv(50, w[4].startSec), inv(1, w[0].startSec - 1), inv(3, NOW_SEC + 60)]
    )
    expect(m.revenue.value).toBe(120.5)
    expect(m.revenue.invoices).toBe(2)
    expect(m.revenue.previous).toBe(50)
    expect(m.revenue.series).toEqual([0, 0, 0, 0, 50, 120.5])
  })

  it("no invoices in the data is 0, never a made-up figure", () => {
    expect(metrics([sub()]).revenue).toEqual({ value: 0, previous: 0, series: [0, 0, 0, 0, 0, 0], invoices: 0 })
  })
})

describe("arpu", () => {
  it("is MRR ÷ paying subscribers, to the cent; null with none", () => {
    expect(arpuOf(100, 3)).toBe(33.33)
    expect(arpuOf(0, 0)).toBeNull()
    const m = metrics([sub(), sub({ items: { data: [{ price: price({ unit_amount: 2_000 }) }] } })])
    expect(m.arpu.value).toBe(34.5)
    expect(metrics([]).arpu).toEqual({ value: null, previous: null })
  })
})

describe("ltv", () => {
  it("is ARPU ÷ monthly churn, with the 28-day rate scaled to an average month", () => {
    // 5% per 28 days → 5.435% a month (× 30.4375/28); $50 / 0.054353 = $919.92
    expect(ltvOf(50, 5)).toBe(919.92)
  })

  it("is null when churn is 0 or unknown, or there is no ARPU", () => {
    expect(ltvOf(50, 0)).toBeNull()
    expect(ltvOf(50, null)).toBeNull()
    expect(ltvOf(null, 5)).toBeNull()
  })

  it("comes from the summary's own ARPU and churn", () => {
    const m = metrics([...Array.from({ length: 19 }, () => sub()), sub({ status: "canceled", ended_at: NOW_SEC - DAY })])
    expect(m.churn.value).toBe(5)
    expect(m.ltv.value).toBe(ltvOf(m.arpu.value, m.churn.value))
  })
})

describe("nrr (today's prices)", () => {
  const w = { startSec: NOW_SEC - 28 * DAY, endSec: NOW_SEC }

  it("is the start cohort's MRR at the end over its MRR at the start", () => {
    const subs = [
      sub(), // $49 kept
      sub({ status: "canceled", ended_at: NOW_SEC - DAY }), // $49 lost
      sub({ start_date: NOW_SEC - 3 * DAY }), // joined inside: not in the cohort
    ]
    expect(nrrFor(subs, w)).toBe(50)
  })

  it("discount changes move it, and it can pass 100%", () => {
    const halfOffEnded = [{ source: { coupon: { percent_off: 50, amount_off: null, duration: "repeating" } }, start: NOW_SEC - 100 * DAY, end: NOW_SEC - 10 * DAY }]
    expect(nrrFor([sub({ discounts: halfOffEnded })], w)).toBe(200)
  })

  it("null with no MRR at the start; the summary says it is priced today", () => {
    expect(nrrFor([], w)).toBeNull()
    const m = metrics([sub()])
    expect(m.nrr.basis).toBe("current_prices")
    expect(m.nrr.series).toHaveLength(6)
    expect(m.nrr.value).toBe(100)
  })
})

describe("trialsStartedPerDay", () => {
  it("counts trial starts per founder-zone day over the last 28 days, oldest first", () => {
    const trial = (iso: string) => sub({ status: "trialing", trial_start: sec(iso), trial_end: sec(iso) + 14 * DAY, first_paid_at: null })
    const subs = [
      trial("2026-10-14T06:00:00Z"), // today, Central
      trial("2026-10-14T04:00:00Z"), // 23:00 on the 13th, Central
      { ...trial("2026-10-13T15:00:00Z"), status: "canceled", ended_at: sec("2026-10-13T16:00:00Z") }, // still a start
      trial("2026-09-17T12:00:00Z"), // the first day of the window
      trial("2026-09-16T12:00:00Z"), // the day before: previousTotal
      sub(), // no trial
    ]
    const series = trialsStartedByDay(subs, NOW, CENTRAL)
    expect(series).toHaveLength(28)
    expect(series[0]).toEqual({ date: "2026-09-17", count: 1 })
    expect(series.at(-1)).toEqual({ date: "2026-10-14", count: 1 })
    expect(series.at(-2)).toEqual({ date: "2026-10-13", count: 2 })
    const m = metrics(subs)
    expect(m.trialsStartedPerDay.total).toBe(4)
    expect(m.trialsStartedPerDay.previousTotal).toBe(1)
    // In UTC the 04:00 start is on the 14th.
    expect(trialsStartedByDay(subs, NOW, "UTC").at(-1)!.count).toBe(2)
  })
})

describe("trialsStartedPerDay across DST (Nov 1, 2026, Central)", () => {
  it("each day keeps its own trials on both sides of the fall-back change", () => {
    const now = new Date("2026-11-03T18:00:00Z") // Tue 3 Nov, 12:00 CST
    const trial = (iso: string) => sub({ status: "trialing", trial_start: sec(iso), trial_end: sec(iso) + 14 * DAY, first_paid_at: null })
    const subs = [
      trial("2026-11-01T04:30:00Z"), // 23:30 CDT Sat 31 Oct
      trial("2026-11-01T05:30:00Z"), // 00:30 CDT Sun 1 Nov
      trial("2026-11-01T06:30:00Z"), // 01:30 CDT, first pass
      trial("2026-11-01T07:30:00Z"), // 01:30 CST, second pass: same day
      trial("2026-11-02T05:30:00Z"), // 23:30 CST Sun 1 Nov (not the 2nd)
      trial("2026-11-02T06:30:00Z"), // 00:30 CST Mon 2 Nov
    ]
    const series = trialsStartedByDay(subs, now, CENTRAL)
    expect(series).toHaveLength(28)
    expect(series.at(-1)!.date).toBe("2026-11-03")
    const day = (d: string) => series.find((x) => x.date === d)!.count
    expect([day("2026-10-31"), day("2026-11-01"), day("2026-11-02"), day("2026-11-03")]).toEqual([1, 4, 1, 0])
    expect(series.reduce((a, d) => a + d.count, 0)).toBe(6)
  })
})

describe("parseStripeSummary with the Oct 20 figures", () => {
  it("reads a full summary back", () => {
    const s = liveSummary("connected")
    expect(parseStripeSummary(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it.each(["pastDue", "arr", "revenue", "arpu", "ltv", "nrr", "trialsStartedPerDay"] as const)(
    "rejects a summary missing %s",
    (key) => {
      const { [key]: _drop, ...rest } = LIVE_METRICS
      void _drop
      expect(parseStripeSummary({ ...liveSummary("connected"), metrics: rest })).toBeNull()
    }
  )

  it("rejects an nrr without its basis", () => {
    const metrics = { ...LIVE_METRICS, nrr: { ...LIVE_METRICS.nrr, basis: "historical" } }
    expect(parseStripeSummary({ ...liveSummary("connected"), metrics })).toBeNull()
  })
})
