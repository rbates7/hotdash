import { afterEach, describe, expect, it, vi } from "vitest"

import {
  addDays,
  inPeriod,
  now,
  periodBefore,
  periodEnding,
  todayIn,
} from "@/lib/clock"
import {
  MOCK_DAY,
  VS_PREVIOUS_WEEK,
  VS_PREVIOUS_WINDOW,
  cashIn,
  churnRate,
  dailyRevenue,
  growthStrip,
  mrrTrend,
  netSubscribers,
  priorExpensesTotal,
  seedChurnedSubscribers,
  seedEventDates,
  seedExpenses,
  seedNewSubscribers,
  snapshotFor,
  truthStrip,
  weekEnding,
} from "@/lib/kpis"
import { expensesTotal, formatMetricValue, trendFor } from "@/lib/metrics"

afterEach(() => vi.useRealTimers())

const DAYS = [MOCK_DAY, "2026-10-07", "2025-12-31", "2026-03-01"] as const

describe("Home and Metrics read the same numbers", () => {
  it.each(DAYS)("truth strip = Subscribers card + a real trailing-7-day cash figure (%s)", (today) => {
    const [subs, cash] = truthStrip({ today })
    const subsCard = snapshotFor("subscribers", { today })

    // Home and Metrics share the Subscribers label; the number is the card's.
    expect(subs.label).toBe("Subscribers")
    expect(subsCard.label).toBe("Subscribers")
    expect(subs.value).toBe(formatMetricValue(subsCard.value, subsCard.unit))
    expect(subs.delta).toBe(`${trendFor(subsCard.value, subsCard.previous, "abs").text} ${VS_PREVIOUS_WINDOW}`)
    expect(VS_PREVIOUS_WINDOW).toBe("vs previous 28 days")

    const { thisWeek, lastWeek } = weekEnding(today)
    const week = cashIn(thisWeek, today)
    const prior = cashIn(lastWeek, today)
    expect(cash.label).toBe("Cash this week")
    expect(cash.value).toBe(`$${week.toLocaleString("en-US")}`)
    expect(cash.delta).toBe(`${trendFor(week, prior, "percent").text} ${VS_PREVIOUS_WEEK}`)
    expect(VS_PREVIOUS_WEEK).toBe("vs previous 7 days")
    expect(cash.direction).toBe("up")
  })

  it("cash this week is seven Central days ending today, not a 28-day average", () => {
    const today = MOCK_DAY
    const { thisWeek, lastWeek } = weekEnding(today)
    expect(thisWeek).toEqual({ start: "2026-08-15", end: "2026-08-21" })
    expect(lastWeek).toEqual({ start: "2026-08-08", end: "2026-08-14" })
    const days = dailyRevenue(today)
    expect(days).toHaveLength(56)
    expect(days.at(-1)!.date).toBe(today)
    // The daily spread sums exactly to the Revenue card's two windows.
    const revenue = snapshotFor("revenue", { today })
    expect(days.slice(28).reduce((a, d) => a + d.amount, 0)).toBe(revenue.value)
    expect(days.slice(0, 28).reduce((a, d) => a + d.amount, 0)).toBe(revenue.previous)
    // And the week is a real sum of its seven days — more than the window average.
    expect(cashIn(thisWeek, today)).toBe(days.slice(-7).reduce((a, d) => a + d.amount, 0))
    expect(cashIn(thisWeek, today)).toBe(7_848)
    expect(cashIn(thisWeek, today)).not.toBe(Math.round(revenue.value / 4))
    expect(cashIn(lastWeek, today)).toBe(7_351)
  })

  it("growth strip mirrors the MRR / ARR / Subscribers / Churn cards", () => {
    const strip = growthStrip({ today: MOCK_DAY })
    expect(strip.map((k) => k.label)).toEqual(["MRR", "ARR", "Subscribers", "Churn Rate"])
    for (const kpi of strip) {
      const snap = snapshotFor(kpi.id as Parameters<typeof snapshotFor>[0], { today: MOCK_DAY })
      expect(kpi.value).toBe(formatMetricValue(snap.value, snap.unit))
    }
    expect(strip[3].lowerIsBetter).toBe(true)
    expect(strip[3].direction).toBe("down")
    for (const kpi of strip) expect(kpi.delta.endsWith(VS_PREVIOUS_WINDOW)).toBe(true)
  })

  it("the Metrics door's trend is the MRR card's series", () => {
    expect(mrrTrend({ today: MOCK_DAY })).toEqual(snapshotFor("mrr", { today: MOCK_DAY }).series)
    expect(mrrTrend({ today: MOCK_DAY }).at(-1)).toBe(26_190)
  })

  it("accepts an instant and resolves it in Central", () => {
    vi.useFakeTimers({ now: new Date("2026-10-08T04:30:00.000Z") }) // 23:30 CT on the 7th
    const fromInstant = truthStrip({ today: now() })
    const fromDay = truthStrip({ today: todayIn(now()) })
    expect(fromInstant).toEqual(fromDay)
  })
})

describe("the seed reconciles", () => {
  it.each(DAYS)("Subscribers delta = new − churned in the tables (%s)", (today) => {
    const subs = snapshotFor("subscribers", { today })
    const net = seedNewSubscribers(today).length - seedChurnedSubscribers(today).length
    expect(net).toBe(3)
    expect(netSubscribers(today)).toBe(net)
    expect(subs.value - subs.previous).toBe(net)
    expect(trendFor(subs.value, subs.previous, "abs").text).toBe("+3")
  })

  it.each(DAYS)("Churn and Retention follow from the churn table and last window's count (%s)", (today) => {
    const subs = snapshotFor("subscribers", { today })
    const churn = snapshotFor("churn", { today })
    const retention = snapshotFor("retention", { today })
    const churned = seedChurnedSubscribers(today).length
    expect(churned).toBe(5)
    expect(subs.previous).toBe(183)
    expect(churnRate(today)).toBeCloseTo((5 / 183) * 100, 10)
    expect(churn.value).toBe(churnRate(today))
    expect(formatMetricValue(churn.value, "percent")).toBe("2.7%")
    expect(retention.value).toBeCloseTo(100 - churn.value, 10)
    expect(formatMetricValue(retention.value, "percent")).toBe("97.3%")
    expect(trendFor(churn.value, churn.previous, "pts", { lowerIsBetter: true }).text).toBe("−1.5 pts")
    expect(trendFor(retention.value, retention.previous, "pts").text).toBe("+1.5 pts")
  })

  it.each(DAYS)("every seed event sits inside the trailing-28-day period shown in the header (%s)", (today) => {
    const period = periodEnding(today)
    const dates = seedEventDates(today)
    expect(dates.length).toBe(8 + 8 + 5)
    for (const d of dates) expect(inPeriod(d, period), `${d} in ${period.start}..${period.end}`).toBe(true)
    // Churned sign-ups are months before the churn, as churn is; they are
    // not period events and are not asserted in-period.
    for (const s of seedChurnedSubscribers(today)) expect(s.signupDate < s.churnDate).toBe(true)
  })

  it("reproduces the mock on the day it was drawn, apart from the reconciled Subscribers delta", () => {
    expect(seedExpenses(MOCK_DAY).map((e) => e.date)).toEqual([
      "2026-08-18", "2026-08-21", "2026-08-01", "2026-08-08", "2026-08-15", "2026-08-12", "2026-08-04", "2026-08-03",
    ])
    expect(seedNewSubscribers(MOCK_DAY)[0].signupDate).toBe("2026-08-18")
    expect(seedChurnedSubscribers(MOCK_DAY)[0].churnDate).toBe("2026-08-08")
    expect(snapshotFor("subscribers", { today: MOCK_DAY }).value).toBe(186)
  })
})

describe("Expenses are scoped to the period", () => {
  const today = MOCK_DAY
  const period = periodEnding(today)

  it("the card sums only rows inside the current period", () => {
    const rows = [
      ...seedExpenses(today),
      { id: "exp-9", category: "Old", amount: 1_000, date: addDays(period.start, -1), recurring: false },
      { id: "exp-10", category: "Future", amount: 1_000, date: addDays(today, 1), recurring: false },
    ]
    expect(expensesTotal(rows)).toBe(10_240)
    expect(expensesTotal(rows, period)).toBe(8_240)
    expect(snapshotFor("expenses", { today, expenses: rows }).value).toBe(8_240)
  })

  it("the comparison is the prior period: baseline plus any rows dated in it", () => {
    const prior = periodBefore(period)
    expect(prior).toEqual({ start: addDays(period.start, -28), end: addDays(period.start, -1) })
    const rows = [
      ...seedExpenses(today),
      { id: "exp-9", category: "Last month", amount: 500, date: prior.end, recurring: false },
      { id: "exp-10", category: "Two months ago", amount: 999, date: addDays(prior.start, -1), recurring: false },
    ]
    expect(priorExpensesTotal(rows, period)).toBe(8_050 + 500)
    const snap = snapshotFor("expenses", { today, expenses: rows })
    expect(snap.previous).toBe(8_550)
    expect(snap.series.at(-2)).toBe(8_550)
    expect(trendFor(snap.value, snap.previous, "percent", { lowerIsBetter: true }).text).toBe("−3.6%")
  })

  it("with no rows in the prior period the baseline alone is the comparison (+2.4%, as the mock)", () => {
    const snap = snapshotFor("expenses", { today })
    expect(snap.value).toBe(8_240)
    expect(snap.previous).toBe(8_050)
    expect(trendFor(snap.value, snap.previous, "percent", { lowerIsBetter: true }).text).toBe("+2.4%")
  })
})
