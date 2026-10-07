"use client"

import * as React from "react"

import {
  DEFAULT_METRIC_IDS,
  METRIC_IDS,
  type ChartType,
  type Expense,
  type MetricId,
} from "@/lib/metrics"
import type { IsoDay } from "@/lib/metrics/clock"
import { seedExpenses } from "@/lib/metrics-fixture"

export type State = {
  /** Cards on the Overview board, in display order. */
  visible: MetricId[]
  /** Per-card chart choice; absent means the metric's default. */
  charts: Partial<Record<MetricId, ChartType>>
  expenses: Expense[]
  /** Next number for a generated exp-n id. */
  nextExpenseId: number
}

export type NewExpenseInput = Omit<Expense, "id">

export type Action =
  | { type: "add-metric"; id: MetricId }
  | { type: "remove-metric"; id: MetricId }
  | { type: "set-chart"; id: MetricId; chart: ChartType }
  | { type: "add-expense"; input: NewExpenseInput }
  | { type: "remove-expense"; id: string }
  | { type: "hydrate"; state: State | null }
  | { type: "reset"; today: IsoDay }

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add-metric":
      if (state.visible.includes(action.id)) return state
      return { ...state, visible: [...state.visible, action.id] }

    case "remove-metric":
      return { ...state, visible: state.visible.filter((id) => id !== action.id) }

    case "set-chart":
      return { ...state, charts: { ...state.charts, [action.id]: action.chart } }

    case "add-expense": {
      const expense: Expense = {
        id: `exp-${state.nextExpenseId}`,
        category: action.input.category.trim(),
        amount: Math.round(action.input.amount),
        date: action.input.date,
        recurring: action.input.recurring,
      }
      // Newest first so the entry just added is visible without scrolling
      // and the table's default (date desc) order still holds.
      return {
        ...state,
        expenses: [expense, ...state.expenses],
        nextExpenseId: state.nextExpenseId + 1,
      }
    }

    case "remove-expense":
      return {
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.id),
      }

    case "hydrate":
      return action.state ?? state

    case "reset":
      return initialState(action.today)
  }
}

/** Reducer state plus whether localStorage has been consulted yet. */
type Shell = { data: State; hydrated: boolean }

function shellReducer(shell: Shell, action: Action): Shell {
  return {
    data: reducer(shell.data, action),
    hydrated: shell.hydrated || action.type === "hydrate",
  }
}

/** The seed, dated relative to `today` so no row ever postdates it. */
export function initialState(today: IsoDay): State {
  const expenses = seedExpenses(today)
  const highest = expenses.reduce((max, e) => {
    const n = Number(e.id.split("-")[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return {
    visible: [...DEFAULT_METRIC_IDS],
    charts: {},
    expenses,
    nextExpenseId: highest + 1,
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board layout, chart choices and expense rows are saved to this browser's
 * localStorage so a reload keeps them. Bump the version whenever the seed
 * or the shape changes so stale saves are discarded instead of
 * half-applied. Stand-in until real Stripe/Supabase wiring; no server copy.
 */
export const STORAGE_KEY = "hotdash.metrics.v1"

function isMetricId(value: unknown): value is MetricId {
  return typeof value === "string" && (METRIC_IDS as readonly string[]).includes(value)
}

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.category === "string" &&
    typeof v.amount === "number" &&
    typeof v.date === "string" &&
    typeof v.recurring === "boolean"
  )
}

function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.visible) &&
    v.visible.every(isMetricId) &&
    typeof v.charts === "object" &&
    v.charts !== null &&
    Array.isArray(v.expenses) &&
    v.expenses.every(isExpense) &&
    typeof v.nextExpenseId === "number"
  )
}

export function loadState(storage: Storage | undefined): State | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveState(storage: Storage | undefined, state: State) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota or private mode: edits still work for the session.
  }
}

type Store = State & {
  /**
   * Today's calendar day (America/Chicago), read once per request on the
   * server and passed in, so SSR and hydration agree and nothing in the
   * tree reads the machine clock.
   */
  today: IsoDay
  /**
   * True once localStorage has been read and writes are flowing. Until then
   * the state is the seed and must not be shown as if it were the user's.
   */
  persisted: boolean
  addMetric: (id: MetricId) => void
  removeMetric: (id: MetricId) => void
  setChart: (id: MetricId, chart: ChartType) => void
  addExpense: (input: NewExpenseInput) => void
  removeExpense: (id: string) => void
  resetDemoData: () => void
}

const MetricsContext = React.createContext<Store | null>(null)

export function MetricsProvider({
  today,
  children,
}: {
  today: IsoDay
  children: React.ReactNode
}) {
  const [{ data: state, hydrated: persisted }, dispatch] = React.useReducer(
    shellReducer,
    today,
    (day) => ({ data: initialState(day), hydrated: false })
  )

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", state: loadState(window.localStorage) })
  }, [])

  React.useEffect(() => {
    if (persisted) saveState(window.localStorage, state)
  }, [persisted, state])

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today,
      persisted,
      addMetric: (id) => dispatch({ type: "add-metric", id }),
      removeMetric: (id) => dispatch({ type: "remove-metric", id }),
      setChart: (id, chart) => dispatch({ type: "set-chart", id, chart }),
      addExpense: (input) => dispatch({ type: "add-expense", input }),
      removeExpense: (id) => dispatch({ type: "remove-expense", id }),
      // Reset regenerates the seed relative to today, not to when it was drawn.
      resetDemoData: () => dispatch({ type: "reset", today }),
    }),
    [state, persisted, today]
  )

  return (
    <MetricsContext.Provider value={value}>{children}</MetricsContext.Provider>
  )
}

export function useMetrics() {
  const ctx = React.useContext(MetricsContext)
  if (!ctx) throw new Error("useMetrics must be used within a MetricsProvider.")
  return ctx
}
