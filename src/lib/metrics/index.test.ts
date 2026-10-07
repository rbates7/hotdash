import { describe, expect, it } from "vitest"

import {
  DEFAULT_METRIC_IDS,
  EXTRA_METRIC_IDS,
  expensesTotal,
  formatCurrency,
  formatMetricValue,
  pickerIds,
  sortRows,
  toggleSort,
  trendFor,
  valuationFromArr,
  type MetricId,
} from "@/lib/metrics"
import { METRIC_DEFS, MOCK_DAY, seedExpenses, snapshotFor } from "@/lib/kpis"

/** The seed as the mock drew it. */
const expenses = seedExpenses(MOCK_DAY)
const ctx = { today: MOCK_DAY, expenses }

/** The headline and trend each card in the mock shows. */
const MOCK: Record<MetricId, [value: string, trend: string, good: boolean]> = {
  mrr: ["$26,190", "+4.2%", true],
  arr: ["$314,280", "+4.2%", true],
  // Churn and retention derive from the seed tables (5 churned of 183), not the mock.
  churn: ["2.7%", "−1.5 pts", true],
  revenue: ["$28,410", "+6.1%", true],
  retention: ["97.3%", "+1.5 pts", true],
  // The mock said +12; the seed now reconciles with its own tables (8 new − 5 churned).
  subscribers: ["186", "+3", true],
  trials: ["28%", "+3.1 pts", true],
  expenses: ["$8,240", "+2.4%", false],
  cac: ["$142", "−8.4%", true],
  ltv: ["$1,680", "+3.7%", true],
  arpu: ["$141", "+2.2%", true],
  nrr: ["108%", "+1.2 pts", true],
  runway: ["14 mo", "+2 mo", true],
  nps: ["52", "+4", true],
  valuation: ["$1.10M", "+4.2%", true],
}

describe("metric snapshots reproduce the mock", () => {
  for (const [id, [value, trend, good]] of Object.entries(MOCK) as [
    MetricId,
    (typeof MOCK)[MetricId],
  ][]) {
    it(`${id}: ${value} ${trend}`, () => {
      const snap = snapshotFor(id, ctx)
      expect(formatMetricValue(snap.value, snap.unit)).toBe(value)
      const t = trendFor(snap.value, snap.previous, snap.trendKind, {
        lowerIsBetter: snap.lowerIsBetter,
        unit: snap.unit,
      })
      expect(t.text).toBe(trend)
      expect(t.good).toBe(good)
      expect(snap.series).toHaveLength(6)
      expect(snap.series.at(-1)).toBe(snap.value)
      expect(snap.series.at(-2)).toBe(snap.previous)
    })
  }

  it("every default and extra metric has a definition", () => {
    for (const id of [...DEFAULT_METRIC_IDS, ...EXTRA_METRIC_IDS]) {
      expect(METRIC_DEFS[id].id).toBe(id)
    }
  })
})

describe("derived metrics", () => {
  it("valuation is ARR × 3.5, shown in millions", () => {
    expect(valuationFromArr(314_280)).toBe(1_099_980)
    expect(formatMetricValue(valuationFromArr(314_280), "currency-millions")).toBe("$1.10M")
    expect(METRIC_DEFS.valuation.note).toMatch(/ARR × 3\.5/)
  })

  it("expenses card is the sum of the expense rows", () => {
    expect(expensesTotal(expenses)).toBe(8_240)
    const more = [...expenses, { id: "x", category: "Vercel", amount: 160, date: "2026-08-20", recurring: true }]
    const snap = snapshotFor("expenses", { today: MOCK_DAY, expenses: more })
    expect(snap.value).toBe(8_400)
    expect(formatMetricValue(snap.value, snap.unit)).toBe("$8,400")
    // Up against last month's 8,050 → and up is bad for a cost.
    const t = trendFor(snap.value, snap.previous, "percent", { lowerIsBetter: true })
    expect(t.text).toBe("+4.3%")
    expect(t.good).toBe(false)
  })

  it("expenses can fall below last month and read as good", () => {
    const snap = snapshotFor("expenses", { today: MOCK_DAY, expenses: expenses.filter((e) => e.category !== "AWS") })
    expect(snap.value).toBe(2_830)
    const t = trendFor(snap.value, snap.previous, "percent", { lowerIsBetter: true })
    expect(t.up).toBe(false)
    expect(t.good).toBe(true)
    expect(t.text).toBe("−64.8%")
  })
})

describe("trendFor", () => {
  it("formats a flat move neutrally", () => {
    const t = trendFor(100, 100, "percent")
    expect(t.flat).toBe(true)
    expect(t.text).toBe("±0.0%")
    expect(t.good).toBe(true)
  })

  it("uses a real minus sign for drops", () => {
    expect(trendFor(90, 100, "percent").text).toBe("−10.0%")
    expect(trendFor(3, 5, "abs").text).toBe("−2")
    expect(trendFor(3, 5, "abs", { unit: "months" }).text).toBe("−2 mo")
    expect(trendFor(1.2, 1.5, "pts").text).toBe("−0.3 pts")
  })

  it("respects lowerIsBetter", () => {
    expect(trendFor(90, 100, "percent", { lowerIsBetter: true }).good).toBe(true)
    expect(trendFor(110, 100, "percent", { lowerIsBetter: true }).good).toBe(false)
    expect(trendFor(110, 100, "percent").good).toBe(true)
  })
})

describe("formatting", () => {
  it("currency rounds to whole dollars with separators", () => {
    expect(formatCurrency(1234.6)).toBe("$1,235")
    expect(formatCurrency(79)).toBe("$79")
  })

  it("percent drops a trailing .0", () => {
    expect(formatMetricValue(28, "percent")).toBe("28%")
    expect(formatMetricValue(96.25, "percent")).toBe("96.3%")
  })
})

describe("pickerIds", () => {
  it("offers the extras first, then removed defaults, never visible ones", () => {
    expect(pickerIds([...DEFAULT_METRIC_IDS])).toEqual([...EXTRA_METRIC_IDS])
    const without = DEFAULT_METRIC_IDS.filter((id) => id !== "mrr" && id !== "revenue")
    expect(pickerIds(without)).toEqual([...EXTRA_METRIC_IDS, "mrr", "revenue"])
    expect(pickerIds([...DEFAULT_METRIC_IDS, ...EXTRA_METRIC_IDS])).toEqual([])
  })
})

describe("sorting", () => {
  const rows = [
    { name: "bob", amount: 5, date: "2026-08-02", flag: true },
    { name: "Alice", amount: 50, date: "2026-07-30", flag: false },
    { name: "carol", amount: 7, date: "2026-08-10", flag: true },
  ]

  it("sorts strings case-insensitively, numbers numerically, dates chronologically", () => {
    expect(sortRows(rows, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual(["Alice", "bob", "carol"])
    expect(sortRows(rows, { key: "amount", dir: "desc" }).map((r) => r.amount)).toEqual([50, 7, 5])
    expect(sortRows(rows, { key: "date", dir: "asc" }).map((r) => r.date)).toEqual([
      "2026-07-30",
      "2026-08-02",
      "2026-08-10",
    ])
    expect(sortRows(rows, { key: "flag", dir: "desc" }).map((r) => r.flag)).toEqual([true, true, false])
  })

  it("returns a copy in original order with no sort", () => {
    const out = sortRows(rows, null)
    expect(out).toEqual(rows)
    expect(out).not.toBe(rows)
  })

  it("toggleSort flips the active column and starts a new one at its default", () => {
    expect(toggleSort(null, "name")).toEqual({ key: "name", dir: "asc" })
    expect(toggleSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" })
    expect(toggleSort({ key: "name", dir: "desc" }, "amount", "desc")).toEqual({ key: "amount", dir: "desc" })
  })
})
