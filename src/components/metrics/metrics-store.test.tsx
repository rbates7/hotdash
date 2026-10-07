import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DEFAULT_METRIC_IDS } from "@/lib/metrics"
import { expenses as seedExpenses } from "@/lib/metrics-fixture"
import {
  MetricsProvider,
  STORAGE_KEY,
  initialState,
  loadState,
  reducer,
  saveState,
  useMetrics,
} from "@/components/metrics/metrics-store"

const VERCEL = { category: " Vercel ", amount: 159.6, date: "2026-08-20", recurring: true }

describe("reducer", () => {
  it("starts with the eight default cards, no chart overrides and the seed expenses", () => {
    const s = initialState()
    expect(s.visible).toEqual([...DEFAULT_METRIC_IDS])
    expect(s.charts).toEqual({})
    expect(s.expenses).toEqual(seedExpenses)
    expect(s.nextExpenseId).toBe(9)
  })

  it("adds a metric to the end and ignores duplicates", () => {
    let s = reducer(initialState(), { type: "add-metric", id: "cac" })
    expect(s.visible.at(-1)).toBe("cac")
    const again = reducer(s, { type: "add-metric", id: "cac" })
    expect(again).toBe(s)
    s = reducer(s, { type: "add-metric", id: "valuation" })
    expect(s.visible).toHaveLength(10)
  })

  it("removes a metric and lets it be added back", () => {
    let s = reducer(initialState(), { type: "remove-metric", id: "mrr" })
    expect(s.visible).not.toContain("mrr")
    expect(s.visible).toHaveLength(7)
    s = reducer(s, { type: "add-metric", id: "mrr" })
    expect(s.visible.at(-1)).toBe("mrr")
  })

  it("can empty the board", () => {
    const s = DEFAULT_METRIC_IDS.reduce(
      (acc, id) => reducer(acc, { type: "remove-metric", id }),
      initialState()
    )
    expect(s.visible).toEqual([])
  })

  it("records a chart choice per card", () => {
    let s = reducer(initialState(), { type: "set-chart", id: "mrr", chart: "line" })
    s = reducer(s, { type: "set-chart", id: "churn", chart: "bar" })
    expect(s.charts).toEqual({ mrr: "line", churn: "bar" })
    s = reducer(s, { type: "set-chart", id: "mrr", chart: "bar" })
    expect(s.charts.mrr).toBe("bar")
  })

  it("adds an expense first, trimmed and rounded, with the next id", () => {
    const s = reducer(initialState(), { type: "add-expense", input: VERCEL })
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
    const s = reducer(initialState(), { type: "remove-expense", id: "exp-1" })
    expect(s.expenses.find((e) => e.id === "exp-1")).toBeUndefined()
    expect(s.expenses).toHaveLength(7)
  })

  it("reset restores the seed", () => {
    let s = reducer(initialState(), { type: "remove-metric", id: "mrr" })
    s = reducer(s, { type: "add-expense", input: VERCEL })
    s = reducer(s, { type: "reset" })
    expect(s).toEqual(initialState())
  })
})

describe("localStorage round trip", () => {
  it("saves and loads the same state", () => {
    let s = reducer(initialState(), { type: "add-metric", id: "nps" })
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
      JSON.stringify({ ...initialState(), visible: ["mrr", "bogus"] })
    )
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...initialState(), expenses: [{ id: "x" }] })
    )
    expect(loadState(window.localStorage)).toBeNull()
  })
})

function Probe() {
  const { visible, charts, expenses, persisted, removeMetric, setChart, addExpense } =
    useMetrics()
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="visible">{visible.join(",")}</span>
      <span data-testid="mrr-chart">{charts.mrr ?? "default"}</span>
      <span data-testid="expense-count">{expenses.length}</span>
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
  it("persists edits and rehydrates them after a remount (reload)", async () => {
    const first = render(
      <MetricsProvider>
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
      <MetricsProvider>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("line")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("9")
  })

  it("falls back to the seed when nothing is saved", async () => {
    render(
      <MetricsProvider>
        <Probe />
      </MetricsProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("visible")).toHaveTextContent(DEFAULT_METRIC_IDS.join(","))
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("default")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("8")
  })
})
