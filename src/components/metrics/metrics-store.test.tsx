import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_METRIC_IDS } from "@/lib/metrics"
import { MOCK_DAY, seedExpenses } from "@/lib/kpis"
import type { LoadResult } from "@/lib/persistence"
import {
  LEGACY_STORAGE_KEYS,
  MetricsProvider,
  STORAGE_KEY,
  initialState,
  isState,
  loadState,
  loadStateOrSeed,
  metricsStorage,
  reducer,
  saveState,
  shiftSeed,
  useMetrics,
} from "@/components/metrics/metrics-store"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const TODAY = MOCK_DAY
const VERCEL = { category: " Vercel ", amount: 159.6, date: "2026-08-20", recurring: true }
type State = ReturnType<typeof initialState>
const hydrate = (state: State | null, today = TODAY) => {
  const result: LoadResult<State> = state ? { state, status: "saved" } : { state: null, status: "empty" }
  return { type: "hydrate" as const, result, today }
}

afterEach(() => vi.restoreAllMocks())

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
    expect(reducer(s, { type: "add-metric", id: "cac" })).toBe(s)
    s = reducer(s, { type: "add-metric", id: "valuation" })
    expect(s.visible).toHaveLength(10)
  })

  it("removes a metric and lets it be added back", () => {
    let s = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    expect(s.visible).not.toContain("mrr")
    s = reducer(s, { type: "add-metric", id: "mrr" })
    expect(s.visible.at(-1)).toBe("mrr")
  })

  it("records a chart choice per card", () => {
    let s = reducer(initialState(TODAY), { type: "set-chart", id: "mrr", chart: "line" })
    s = reducer(s, { type: "set-chart", id: "churn", chart: "bar" })
    expect(s.charts).toEqual({ mrr: "line", churn: "bar" })
  })

  it("adds an expense first, trimmed, rounded and at least $1, with the next id", () => {
    const s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    expect(s.expenses[0]).toEqual({ id: "exp-9", category: "Vercel", amount: 160, date: "2026-08-20", recurring: true })
    expect(s.nextExpenseId).toBe(10)
    const tiny = reducer(s, { type: "add-expense", input: { ...VERCEL, amount: 0.2 } })
    expect(tiny.expenses[0].amount).toBe(1)
  })

  it("removes an expense by id", () => {
    const s = reducer(initialState(TODAY), { type: "remove-expense", id: "exp-1" })
    expect(s.expenses.find((e) => e.id === "exp-1")).toBeUndefined()
  })

  it("reset regenerates the seed relative to the day it is pressed", () => {
    let s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    s = reducer(s, { type: "reset", today: "2026-10-07" })
    expect(s).toEqual(initialState("2026-10-07"))
    expect(s.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-10-07")
  })

  it("hydrate with an empty result keeps the seed", () => {
    const seed = initialState(TODAY)
    expect(reducer(seed, hydrate(null))).toBe(seed)
  })
})

describe("seed ageing on load", () => {
  it("moves seed rows forward by the days since they were seeded, capped at today", () => {
    const saved = reducer(initialState("2026-08-21"), { type: "add-expense", input: VERCEL })
    const loaded = shiftSeed(saved, "2026-08-28")
    expect(loaded.seededAt).toBe("2026-08-28")
    expect(loaded.expenses.find((e) => e.id === "exp-1")!.date).toBe("2026-08-25")
    expect(loaded.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-08-28")
    expect(loaded.expenses.find((e) => e.category === "Vercel")!.date).toBe("2026-08-20")
  })

  it("leaves a same-day or future-dated save alone", () => {
    const saved = initialState("2026-08-21")
    expect(shiftSeed(saved, "2026-08-21")).toBe(saved)
    expect(shiftSeed(saved, "2026-08-20")).toBe(saved)
  })

  it("falls back to a fresh seed when the saved copy defeats the arithmetic", () => {
    const broken = { ...initialState(TODAY), seededAt: "garbage" }
    expect(shiftSeed(broken, "2026-10-07")).toEqual(initialState("2026-10-07"))
    const worse = { ...initialState(TODAY), expenses: null as unknown as [] }
    expect(shiftSeed(worse, "2026-10-07")).toEqual(initialState("2026-10-07"))
  })

  it("the hydrate action applies the shift", () => {
    const s = reducer(initialState("2026-09-01"), hydrate(initialState("2026-08-21"), "2026-09-01"))
    expect(s.seededAt).toBe("2026-09-01")
    expect(s.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-09-01")
  })
})

describe("isState rejects a bad saved copy", () => {
  const good = initialState(TODAY)
  const cases: [string, unknown][] = [
    ["not an object", "nope"],
    ["unknown metric id", { ...good, visible: ["mrr", "bogus"] }],
    ["duplicate visible cards", { ...good, visible: ["mrr", "mrr"] }],
    ["unknown chart type", { ...good, charts: { mrr: "pie" } }],
    ["chart for unknown metric", { ...good, charts: { bogus: "bar" } }],
    ["charts as an array", { ...good, charts: [] }],
    ["impossible expense date", { ...good, expenses: [{ ...good.expenses[0], date: "2026-13-45" }] }],
    ["non-canonical expense date", { ...good, expenses: [{ ...good.expenses[0], date: "2026-8-3" }] }],
    ["expense date with time", { ...good, expenses: [{ ...good.expenses[0], date: "2026-08-03T00:00:00Z" }] }],
    ["negative amount", { ...good, expenses: [{ ...good.expenses[0], amount: -5 }] }],
    ["NaN amount", { ...good, expenses: [{ ...good.expenses[0], amount: Number.NaN }] }],
    ["duplicate expense ids", { ...good, expenses: [good.expenses[0], good.expenses[0]] }],
    ["nextExpenseId not above the highest id", { ...good, nextExpenseId: 8 }],
    ["nextExpenseId fractional", { ...good, nextExpenseId: 9.5 }],
    ["impossible seededAt", { ...good, seededAt: "2026-13-45" }],
    ["missing seededAt (the v1 shape)", (() => { const { seededAt: _s, ...rest } = good; void _s; return rest })()],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the seed and an edited copy", () => {
    expect(isState(good)).toBe(true)
    expect(isState(reducer(good, { type: "add-expense", input: VERCEL }))).toBe(true)
  })

  it("a rejected copy is parked under <key>.rejected and the page gets the seed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, visible: ["mrr", "mrr"] })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(metricsStorage.rejectedKey)).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(initialState(TODAY))
  })
})

describe("localStorage", () => {
  it("uses the v2 key and drops v1", () => {
    expect(STORAGE_KEY).toBe("hotdash.metrics.v2")
    window.localStorage.setItem(LEGACY_STORAGE_KEYS[0], "{}")
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS[0])).toBeNull()
  })

  it("loadStateOrSeed returns the seed for today when nothing is saved, and the aged copy when there is", () => {
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(initialState(TODAY))
    saveState(window.localStorage, initialState("2026-08-21"))
    expect(loadStateOrSeed(window.localStorage, "2026-08-24").seededAt).toBe("2026-08-24")
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = reducer(initialState(TODAY), { type: "add-expense", input: VERCEL })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    expect(saveState(quotaExceededStorage() as unknown as Storage, s)).toBe(false)
  })
})

function Probe() {
  const { today, visible, charts, expenses, persisted, edited, saved, saveFailed, removeMetric, setChart, addExpense, resetDemoData } =
    useMetrics()
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="today">{today}</span>
      <span data-testid="visible">{visible.join(",")}</span>
      <span data-testid="mrr-chart">{charts.mrr ?? "default"}</span>
      <span data-testid="expense-count">{expenses.length}</span>
      <span data-testid="dates">{expenses.map((e) => e.date).join(",")}</span>
      <button type="button" onClick={() => { removeMetric("arr"); setChart("mrr", "line"); addExpense(VERCEL) }}>
        edit
      </button>
      <button type="button" onClick={resetDemoData}>reset</button>
    </div>
  )
}

const mount = (today = TODAY) =>
  render(
    <MetricsProvider today={today}>
      <Probe />
    </MetricsProvider>
  )

describe("MetricsProvider persistence", () => {
  it("does not write the untouched seed on first load", () => {
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("is hydrated before the first paint, so saved data never follows a flash of seed", () => {
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove-metric", id: "arr" }))
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
  })

  it("persists edits (saved=true), rehydrates after a remount, and Reset clears the key and re-dates from now", () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    const first = mount()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Vercel"')

    first.unmount()
    mount()
    expect(screen.getByTestId("visible")).not.toHaveTextContent("arr")
    expect(screen.getByTestId("mrr-chart")).toHaveTextContent("line")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("9")

    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("expense-count")).toHaveTextContent("8")
    expect(screen.getByTestId("dates")).toHaveTextContent("2026-10-07")
    vi.useRealTimers()
  })

  it("on a later day, a saved seed reads relative to that day; user rows do not move; nothing is written back", () => {
    saveState(window.localStorage, reducer(initialState("2026-08-21"), { type: "add-expense", input: VERCEL }))
    mount("2026-08-24")
    const dates = screen.getByTestId("dates").textContent!.split(",")
    expect(dates).toContain("2026-08-24")
    expect(dates).toContain("2026-08-21")
    expect(dates).toContain("2026-08-20")
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).seededAt).toBe("2026-08-21")
  })

  it("reports a failed save and never claims Saved", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const full = quotaExceededStorage()
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(full.setItem)
    mount()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=false failed=true")
    spy.mockRestore()
  })

  it("re-hydrates when another tab writes or clears the key", () => {
    mount()
    const theirs = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("visible")).not.toHaveTextContent("mrr")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=true")

    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    // Cleared elsewhere: our in-memory board stays, but nothing is saved any more.
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
  })
})
