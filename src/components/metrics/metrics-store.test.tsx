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
  shellReducer,
  shiftSeed,
  useMetrics,
} from "@/components/metrics/metrics-store"
import { initialShell } from "@/lib/persistence"

/** Drive the shell (hydrate/reset live there, not in the board reducer) and return its data. */
const viaShell = (state: ReturnType<typeof initialState>, action: Parameters<typeof shellReducer>[1]) =>
  shellReducer({ ...initialShell(state), persisted: true }, action).data
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

  it("a no-op edit returns the very same shell, so nothing is written for it", () => {
    const shell = { ...initialShell(initialState(TODAY)), persisted: true }
    expect(shellReducer(shell, { type: "add-metric", id: "mrr" })).toBe(shell) // already visible
    expect(shellReducer(shell, { type: "remove-expense", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove-metric", id: "mrr" })
    expect(edited).not.toBe(shell)
    expect(edited.edits).toBe(1)
    expect(edited.edited).toBe(true)
    expect(edited.saved).toBe(false) // until the write succeeds
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
    s = viaShell(s, { type: "reset", today: "2026-10-07" })
    expect(s).toEqual(initialState("2026-10-07"))
    expect(s.expenses.find((e) => e.id === "exp-2")!.date).toBe("2026-10-07")
  })

  it("hydrate with an empty result re-seeds for today (nothing saved, or a Reset elsewhere)", () => {
    const edited = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    expect(viaShell(edited, hydrate(null))).toEqual(initialState(TODAY))
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
    const s = viaShell(initialState("2026-09-01"), hydrate(initialState("2026-08-21"), "2026-09-01"))
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
    ["zero amount", { ...good, expenses: [{ ...good.expenses[0], amount: 0 }] }],
    ["fractional amount", { ...good, expenses: [{ ...good.expenses[0], amount: 12.5 }] }],
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
    expect(metricsStorage.rejected(window.localStorage)[0].raw).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(initialState(TODAY))
  })
})

describe("localStorage", () => {
  it("uses the v2 key; v1 is ignored on load and dropped on the first real save", () => {
    expect(STORAGE_KEY).toBe("hotdash.metrics.v2")
    window.localStorage.setItem(LEGACY_STORAGE_KEYS[0], "{}")
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS[0])).toBe("{}")
    saveState(window.localStorage, initialState(TODAY))
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
    // A different copy (the identical one would be a no-op, not a write).
    const changed = reducer(s, { type: "remove-metric", id: "mrr" })
    expect(saveState(quotaExceededStorage() as unknown as Storage, changed)).toBe(false)
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

  it("persists edits (saved=true), rehydrates after a remount, and Reset clears the key and re-seeds around the request's day", () => {
    // A client clock that disagrees with the request must not leak into the
    // reset: the page re-seeds around the day it was served with.
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
    expect(screen.getByTestId("today")).toHaveTextContent(TODAY)
    expect(screen.getByTestId("expense-count")).toHaveTextContent("8")
    expect(screen.getByTestId("dates")).toHaveTextContent(TODAY)
    expect(screen.getByTestId("dates")).not.toHaveTextContent("2026-10-07")
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

  it("re-hydrates when another tab writes the key, and re-seeds when another tab Resets", () => {
    mount()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    const theirs = reducer(initialState(TODAY), { type: "remove-metric", id: "mrr" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("visible")).not.toHaveTextContent("mrr")
    expect(screen.getByTestId("visible")).toHaveTextContent("arr") // theirs wins, ours is gone
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")

    // Their Reset: the key is gone, so this tab goes back to a fresh seed too.
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("visible")).toHaveTextContent(DEFAULT_METRIC_IDS.join(","))
    expect(screen.getByTestId("expense-count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
  })

  it("two tabs on one storage: an edit in A reaches B and the writes settle at one", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(
      <>
        <MetricsProvider today={TODAY}>
          <div data-tab="a"><Probe /></div>
        </MetricsProvider>
        <MetricsProvider today={TODAY}>
          <div data-tab="b"><Probe /></div>
        </MetricsProvider>
      </>
    )
    const tab = (id: string) => document.querySelector(`[data-tab=${id}]`) as HTMLElement
    const status = (id: string) => tab(id).querySelector("[data-testid=status]")!.textContent
    const visible = (id: string) => tab(id).querySelector("[data-testid=visible]")!.textContent

    expect(setItem).not.toHaveBeenCalled() // loading never writes

    // A edits → exactly one write. The browser would now fire `storage` in B.
    act(() => (tab("a").querySelector("button") as HTMLButtonElement).click())
    expect(setItem).toHaveBeenCalledTimes(1)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))

    // B took A's copy without writing it back; A's own hydrate (jsdom fires
    // the event in the same window) did not write either.
    expect(visible("b")).not.toContain("arr")
    expect(status("b")).toContain("saved=true")
    expect(setItem).toHaveBeenCalledTimes(1)

    // Settle: nothing else is written however many events bounce.
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(setItem).toHaveBeenCalledTimes(1)

    // B edits → one more write, and A follows the same way.
    act(() => (tab("b").querySelector("button") as HTMLButtonElement).click())
    expect(setItem).toHaveBeenCalledTimes(2)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(setItem).toHaveBeenCalledTimes(2)
  })
})
