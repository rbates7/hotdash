import { describe, expect, it } from "vitest"

import { computeStripeMetrics, type StripeCharge, type StripeData, type StripeSubscription } from "@/lib/stripe-metrics"
import {
  MRR_CASH_CONNECTING,
  MRR_CASH_NOT_CONNECTED,
  cashWeek,
  computeMrrCash,
  monthLabel,
  monthsEnding,
  mrrChart,
  onFetchFailure,
  panelStateOf,
  parseMrrCashSummary,
  type MrrCashSummary,
} from "@/lib/stripe-mrr-cash"

const CT = "America/Chicago"
/** Wed Oct 14 2026, 12:00 PM CDT. */
const NOW = new Date("2026-10-14T17:00:00.000Z")
const sec = (iso: string) => Date.parse(iso) / 1000

function sub(id: string, startIso: string, cents: number, endIso: string | null = null): StripeSubscription {
  const start = sec(startIso)
  return {
    id,
    status: endIso ? "canceled" : "active",
    currency: "usd",
    created: start,
    start_date: start,
    trial_start: null,
    trial_end: null,
    ended_at: endIso ? sec(endIso) : null,
    canceled_at: endIso ? sec(endIso) : null,
    first_paid_at: start,
    items: { data: [{ price: { currency: "usd", unit_amount: cents, recurring: { interval: "month", interval_count: 1 } } }] },
  }
}

const charge = (id: string, iso: string, amount: number, extra: Partial<StripeCharge> = {}): StripeCharge => ({
  id,
  amount,
  currency: "usd",
  status: "succeeded",
  captured: true,
  created: sec(iso),
  ...extra,
})

const DATA: StripeData = {
  subscriptions: [
    sub("a", "2025-06-01T12:00:00Z", 4_900),
    sub("b", "2026-08-15T12:00:00Z", 9_900),
    sub("c", "2026-03-10T12:00:00Z", 2_000, "2026-09-20T12:00:00Z"),
  ],
  charges: [
    // This week (Mon Oct 12 CDT starts 05:00Z).
    charge("mon", "2026-10-12T15:00:00Z", 10_000),
    charge("tue", "2026-10-13T15:00:00Z", 5_000),
    charge("wed-am", "2026-10-14T14:00:00Z", 2_500),
    charge("wed-later", "2026-10-14T20:00:00Z", 99_999), // after now: not yet
    charge("failed", "2026-10-13T16:00:00Z", 7_000, { status: "failed" }),
    charge("eur", "2026-10-13T16:00:00Z", 7_000, { currency: "eur" }),
    // Last week.
    charge("lmon", "2026-10-05T15:00:00Z", 3_000),
    charge("lwed-am", "2026-10-07T16:00:00Z", 1_000),
    charge("lwed-pm", "2026-10-07T20:00:00Z", 4_000), // after the same time last week
    charge("lthu", "2026-10-08T15:00:00Z", 6_000),
    // Sunday Oct 11, 11 PM CDT: last week, not this one.
    charge("lsun-late", "2026-10-12T04:00:00Z", 800),
  ],
}

describe("monthsEnding", () => {
  it("is the last 12 calendar months in the zone, this one ending now", () => {
    const months = monthsEnding(NOW, CT)
    expect(months).toHaveLength(12)
    expect(months[0].month).toBe("2025-11")
    expect(months[11]).toEqual({ month: "2026-10", endSec: NOW.getTime() / 1000, partial: true })
    // September ends at Oct 1 00:00 CDT.
    expect(months[10]).toEqual({ month: "2026-09", endSec: sec("2026-10-01T05:00:00Z"), partial: false })
    expect(months.slice(0, 11).every((m) => !m.partial)).toBe(true)
  })

  it("crosses the year and uses the zone's calendar, not UTC's", () => {
    // Jan 1 2027 00:30 UTC is still Dec 31 in Central.
    const nye = new Date("2027-01-01T00:30:00Z")
    expect(monthsEnding(nye, CT, 3).map((m) => m.month)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(monthsEnding(nye, "UTC", 3).map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01"])
  })
})

describe("mrrChart", () => {
  it("is MRR at each month's end, in dollars", () => {
    const points = mrrChart(DATA, NOW, CT)
    const at = (m: string) => points.find((p) => p.month === m)!.value
    expect(at("2025-11")).toBe(49) // a only
    expect(at("2026-07")).toBe(69) // a + c
    expect(at("2026-08")).toBe(168) // a + b + c
    expect(at("2026-09")).toBe(148) // c ended Sep 20
    expect(at("2026-10")).toBe(148)
  })

  it("agrees with the summary's MRR now", () => {
    const now = computeStripeMetrics(DATA, { now: NOW, timeZone: CT }).mrr.value
    expect(mrrChart(DATA, NOW, CT).at(-1)!.value).toBe(now)
  })
})

describe("cashWeek", () => {
  const cash = cashWeek(DATA, NOW, CT)

  it("is gross cash per day from Monday, with days ahead null", () => {
    expect(cash.since).toBe("2026-10-12T05:00:00.000Z")
    expect(cash.days.map((d) => d.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ])
    expect(cash.days.map((d) => d.value)).toEqual([100, 50, 25, null, null, null, null])
  })

  it("compares each day with the same weekday last week, today cut at the same time", () => {
    expect(cash.days.map((d) => d.previous)).toEqual([30, 0, 10, null, null, null, null])
  })

  it("totals match the summary's Cash this week exactly", () => {
    const summary = computeStripeMetrics(DATA, { now: NOW, timeZone: CT }).cashThisWeek
    expect(cash.value).toBe(summary.value)
    expect(cash.previous).toBe(summary.previous)
    expect(cash.since).toBe(summary.since)
    expect(cash.value).toBe(175)
    expect(cash.previous).toBe(40)
  })

  it("starts the week on the zone's Monday", () => {
    const utc = cashWeek(DATA, NOW, "UTC")
    expect(utc.since).toBe("2026-10-12T00:00:00.000Z")
    // Sunday 11 PM CDT is Monday 04:00 UTC: this week in UTC.
    expect(utc.days[0].value).toBe(108)
  })
})

describe("parseMrrCashSummary", () => {
  const live: MrrCashSummary = {
    status: "connected",
    lastSyncedAt: NOW.toISOString(),
    ...computeMrrCash(DATA, { now: NOW, timeZone: CT }),
  }

  it("round-trips every status", () => {
    expect(parseMrrCashSummary(JSON.parse(JSON.stringify(live)))).toEqual(live)
    expect(parseMrrCashSummary({ ...live, status: "stale" })).toMatchObject({ status: "stale" })
    expect(parseMrrCashSummary({ status: "connecting", lastSyncedAt: null })).toEqual(MRR_CASH_CONNECTING)
    expect(parseMrrCashSummary({ status: "not_connected" })).toEqual(MRR_CASH_NOT_CONNECTED)
  })

  it("rejects anything incomplete", () => {
    expect(parseMrrCashSummary(null)).toBeNull()
    expect(parseMrrCashSummary({ status: "sample" })).toBeNull()
    expect(parseMrrCashSummary({ ...live, lastSyncedAt: "soon" })).toBeNull()
    expect(parseMrrCashSummary({ ...live, mrr: { points: [] } })).toBeNull()
    expect(parseMrrCashSummary({ ...live, mrr: { points: [{ month: "Oct", value: 1, partial: true }] } })).toBeNull()
    expect(parseMrrCashSummary({ ...live, cash: { ...live.cash, days: live.cash.days.slice(1) } })).toBeNull()
    expect(parseMrrCashSummary({ ...live, cash: { ...live.cash, value: "175" } })).toBeNull()
  })
})

describe("in the browser", () => {
  const live: MrrCashSummary = {
    status: "connected",
    lastSyncedAt: NOW.toISOString(),
    ...computeMrrCash(DATA, { now: NOW, timeZone: CT }),
  }

  it("never has a sample state", () => {
    expect(panelStateOf({ phase: "loading" })).toEqual({ kind: "loading" })
    expect(panelStateOf({ phase: "ready", summary: MRR_CASH_CONNECTING })).toEqual({ kind: "loading", connecting: true })
    expect(panelStateOf({ phase: "ready", summary: MRR_CASH_NOT_CONNECTED })).toEqual({ kind: "not_connected" })
    expect(panelStateOf({ phase: "ready", summary: live })).toMatchObject({ kind: "live", stale: false })
    expect(panelStateOf({ phase: "ready", summary: { ...live, status: "stale" } })).toMatchObject({ kind: "live", stale: true })
  })

  it("a failed read keeps figures as stale, otherwise reads not connected", () => {
    expect(onFetchFailure({ phase: "ready", summary: live })).toEqual({ phase: "ready", summary: { ...live, status: "stale" } })
    expect(onFetchFailure({ phase: "loading" })).toEqual({ phase: "ready", summary: MRR_CASH_NOT_CONNECTED })
    expect(onFetchFailure({ phase: "ready", summary: MRR_CASH_CONNECTING })).toEqual({ phase: "ready", summary: MRR_CASH_NOT_CONNECTED })
  })

  it("labels months", () => {
    expect(monthLabel("2026-10")).toBe("Oct")
    expect(monthLabel("2025-11", true)).toBe("Nov 2025")
  })
})
