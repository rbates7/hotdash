import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DEFAULT_METRIC_IDS } from "@/lib/metrics"
import { MOCK_DAY, seedExpenses } from "@/lib/metrics-fixture"
import {
  LEGACY_STORAGE_KEYS,
  MetricsProvider,
  STORAGE_KEY,
  initialState,
  loadState,
  reducer,
  saveState,
  shiftSeed,
  useMetrics,
} from "@/components/metrics/metrics-store"

const TODAY = MOCK_DAY
const VERCEL = { category: " Vercel ", amount: 159.6, date: "2026-08-20", recurring: true }

describe("reducer", () => {
  it("starts with the eight default cards, no chart overrides and the seed expenses", () => {
    const s = initialState(TODAY)
    expect(s.visible).toEqual([...DEFAULT_METRIC_IDS])
    expect(s.charts).toEqual({})
    expect(s.expenses).toEqual(seedExpenses(TODAY))
    expect(s.nextExpenseId).toBe(9)
    expect(s.seededAt).toBe(TODAY)
  })

  it("adds a metric to the end and ignores duplicates", () => {
    let s = reducer(initialState(TODAY), { type: "add-metric", id: "cac" })
    expect(s.visible.at(-1)).toBe("cac")
    const again = reducer(s, { type: "add-metric", id: "cac" })
    expect(again).toBe(s)
    s = reducer(s, { type: "add-metric", id: "valuation" })
    expect(s.visible).toHaveLength(10)
  })

  it("removes a metric and lets it be added back", () => {
    let s = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    expect(s.visible).not.toContain("mrr")
    expect(s.visible).toHaveLength(7)
    s = reducer(s, { type: "add-metric", id: "mrr" })
    expect(s.visible.at(-1)).toBe("mrr")
  })

  it("can empty the board", () => {
    const s = DEFAULT_METRIC_IDS.reduce(
      (acc, id) => reducer(acc, { type: "remove-metric", id }),
      initialState(TODAY)
    )
    expect(s.visible).toEqual([])
  })

  it("records a chart choice per card", () => {
    let s = reducer(initialState(TODAY), { type: "set-chart", id: "mrr", chart: "line" })
    s = reducer(s, { type: "set-chart", id: "churn", chart: "bar" })
    expect(s.charts).toEqual({ mrr: "line", churn: "bar" })
    s = reducer(s, { type: "set-chart", id: "mrr", chart: "bar" })
    expect(s.charts.mrr).toBe("bar")
  })

  it("adds an expense first, trimmed and rounded, with the next id", () => {
    const s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    expect(s.expenses[0]).toEqual({
      id: "exp-9",
      category: "Vercel",
      amount: 160,
      date: "2026-08-20",
      recurring: true,
    })
    expect(s.expenses).toHaveLength(9)
    expect(s.nextExpenseId).toBe(10)
  })

  it("removes an expense by id", () => {
    const s = reducer(initialState(TODAY), { type: "remove-expense", id: "exp-1" })
    expect(s.expenses.find((e) => e.id === "exp-1")).toBeUndefined()
    expect(s.expenses).toHaveLength(7)
  })

  it("reset restores the seed", () => {
    let s = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    s = reducer(s, { type: "add-expense", input: VERCEL })
    s = reducer(s, { type: "reset", today: TODAY })
    expect(s).toEqual(initialState(TODAY))
  })

  it("reset regenerates the seed relative to the day it is pressed", () => {
    let s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    s = reducer(s, { type: "reset", today: "2026-10-07" })
    expect(s.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-10-07")
    expect(s.expenses.every((e) => e.date <= "2026-10-07")).toBe(true)
    expect(s.expenses.some((e) => e.category === "Vercel")).toBe(false)
  })

  it("persisted expenses keep their absolute dates; only the seed moves", () => {
    const s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    expect(s.expenses[0].date).toBe("2026-08-20")
  })
})

describe("seed ageing on load", () => {
  it("moves seed rows forward by the days since they were seeded, capped at today", () => {
    const saved = reducer(initialState("2026-08-21"), { type: "add-expense", input: VERCEL })
    const loaded = shiftSeed(saved, "2026-08-28")
    expect(loaded.seededAt).toBe("2026-08-28")
    // Seed rows: +7 days. Stripe fees was "today" and stays "today".
    expect(loaded.expenses.find((e) => e.id === "exp-1")!.date).toBe("2026-08-25")
    expect(loaded.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-08-28")
    // The user's row keeps its absolute date.
    expect(loaded.expenses.find((e) => e.category === "Vercel")!.date).toBe("2026-08-20")
    expect(loaded.expenses.every((e) => e.date <= "2026-08-28")).toBe(true)
  })

  it("leaves a same-day or future-dated save alone", () => {
    const saved = initialState("2026-08-21")
    expect(shiftSeed(saved, "2026-08-21")).toBe(saved)
    expect(shiftSeed(saved, "2026-08-20")).toBe(saved)
  })

  it("the hydrate action applies the shift", () => {
    const saved = initialState("2026-08-21")
    const s = reducer(initialState("2026-09-01"), { type: "hydrate", state: saved, today: "2026-09-01" })
    expect(s.seededAt).toBe("2026-09-01")
    expect(s.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-09-01")
  })
})

describe("localStorage round trip", () => {
  it("uses the v2 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.metrics.v2")
    expect(LEGACY_STORAGE_KEYS).toContain("hotdash.metrics.v1")
  })

  it("ignores and removes an old v1 save", () => {
    const v1 = {
      visible: ["mrr"],
      charts: {},
      expenses: [{ id: "exp-1", category: "AWS", amount: 1, date: "2026-08-18", recurring: true }],
      nextExpenseId: 9,
    }
    window.localStorage.setItem("hotdash.metrics.v1", JSON.stringify(v1))
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem("hotdash.metrics.v1")).toBeNull()
  })

  it("rejects a v2-keyed save that lacks seededAt (the v1 shape)", () => {
    const { seededAt: _dropped, ...v1Shape } = initialState(TODAY)
    void _dropped
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Shape))
    expect(loadState(window.localStorage)).toBeNull()
  })

  it("saves and loads the same state", () => {
    let s = reducer(initialState(TODAY), { type: "add-metric", id: "nps" })
    s = reducer(s, { type: "set-chart", id: "arr", chart: "line" })
    s = reducer(s, { type: "add-expense", input: VERCEL })
    saveState(window.localStorage, s)
    expect(loadState(window.localStorage)).toEqual(s)
  })

  it("ignores garbage, wrong shapes and unknown metric ids", () => {
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible: ["mrr"] }))
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...initialState(TODAY), visible: ["mrr", "bogus"] })
    )
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...initialState(TODAY), expenses: [{ id: "x" }] })
    )
    expect(loadState(window.localStorage)).toBeNull()
  })
})

function Probe() {
  const { today, visible, charts, expenses, persisted, removeMetric, setChart, addExpense } =
    useMetrics()
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="today">{today}</span>
      <span data-testid="visible">{visible.join(",")}</span>
      <span data-testid="mrr-chart">{charts.mrr ?? "default"}</span>
      <span data-testid="expense-count">{expenses.length}</span>
      <span data-testid="dates">{expenses.map((e) => e.date).join(",")}</span>
      <button
        type="button"
        onClick={() => {
          removeMetric("arr")
          setChart("mrr", "line")
          addExpense(VERCEL)
        }}
      >
        edit
      </button>
    </div>
  )
}

describe("MetricsProvider persistence", () => {
  it("does not write the untouched seed on first load", async () => {
    render(
      <MetricsProvider today={TODAY}>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("on a later day, a saved seed reads relative to that day; user rows do not move", async () => {
    saveState(window.localStorage, reducer(initialState("2026-08-21"), { type: "add-expense", input: VERCEL }))
    render(
      <MetricsProvider today="2026-08-24">
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    const dates = screen.getByTestId("dates").textContent!.split(",")
    expect(dates).toContain("2026-08-24") // Stripe fees, shifted +3
    expect(dates).toContain("2026-08-21") // AWS, was −3
    expect(dates).toContain("2026-08-20") // Vercel, untouched
    // Reading did not write anything back.
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).seededAt).toBe("2026-08-21")
  })

  it("persists edits and rehydrates them after a remount (reload)", async () => {
    const first = render(
      <MetricsProvider today={TODAY}>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("visible")).toHaveTextContent(DEFAULT_METRIC_IDS.join(","))

    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("line")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("9")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Vercel"')

    // Simulate a reload: tear the tree down and mount a fresh provider.
    first.unmount()
    render(
      <MetricsProvider today={TODAY}>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("line")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("9")
  })

  it("is hydrated before the first paint, so saved data never follows a flash of seed", () => {
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove-metric", id: "arr" }))
    // render() flushes layout effects synchronously; no awaiting here on
    // purpose — the saved copy must already be in place when it returns.
    render(
      <MetricsProvider today={TODAY}>
        <Probe />
      </MetricsProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
  })

  it("falls back to the seed when nothing is saved", async () => {
    render(
      <MetricsProvider today={TODAY}>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("visible")).toHaveTextContent(DEFAULT_METRIC_IDS.join(","))
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("default")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("8")
    expect(screen.getByTestId("today")).toHaveTextContent(TODAY)
  })
})
