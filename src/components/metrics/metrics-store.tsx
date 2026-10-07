"use client"

import * as React from "react"

import {
  addDays,
  daysBetween,
  isIsoDay,
  now,
  todayIn,
  type IsoDay,
} from "@/lib/clock"
import { SEED_EXPENSE_IDS, seedExpenses } from "@/lib/kpis"
import {
  DEFAULT_METRIC_IDS,
  METRIC_IDS,
  type ChartType,
  type Expense,
  type MetricId,
} from "@/lib/metrics"
import {
  createStorage,
  dedupe,
  isBoolean,
  isFiniteNumber,
  isString,
  initialShell,
  persistenceShellReducer,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

export type State = {
  /** Cards on the Overview board, in display order. */
  visible: MetricId[]
  /** Per-card chart choice; absent means the metric's default. */
  charts: Partial<Record<MetricId, ChartType>>
  expenses: Expense[]
  /** Next number for a generated exp-n id. */
  nextExpenseId: number
  /**
   * The day the seed rows were dated against. On load they are shifted
   * forward by the days since, so an edit made last week does not pin the
   * sample expenses to last week. User-added rows keep their own dates.
   */
  seededAt: IsoDay
}

export type NewExpenseInput = Omit<Expense, "id">

export type Action =
  | { type: "add-metric"; id: MetricId }
  | { type: "remove-metric"; id: MetricId }
  | { type: "set-chart"; id: MetricId; chart: ChartType }
  | { type: "add-expense"; input: NewExpenseInput }
  | { type: "remove-expense"; id: string }
  | { type: "hydrate"; result: LoadResult<State>; today: IsoDay }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; today: IsoDay }

/** The user's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

/** The board's own transitions. Returns its input for a no-op (e.g. a duplicate add). */
export function reducer(state: State, action: EditAction): State {
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
        // Whole dollars, at least one: the form enforces it, the store guarantees it.
        amount: Math.max(1, Math.round(action.input.amount)),
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

    case "remove-expense": {
      if (!state.expenses.some((e) => e.id === action.id)) return state
      return {
        ...state,
        expenses: state.expenses.filter((e) => e.id !== action.id),
      }
    }
  }
}

/**
 * Bring a saved seed up to date: its rows move forward by the days since
 * `seededAt`, capped at today. Rows the user added are left alone. A copy
 * that defeats the arithmetic falls back to a fresh seed rather than
 * crashing the page — the raw copy has already been parked by `load`.
 */
export function shiftSeed(state: State, today: IsoDay): State {
  try {
    const delta = daysBetween(state.seededAt, today)
    if (!Number.isFinite(delta)) return initialState(today)
    if (delta <= 0) return state
    return {
      ...state,
      seededAt: today,
      expenses: state.expenses.map((e) => {
        if (!SEED_EXPENSE_IDS.has(e.id)) return e
        const shifted = addDays(e.date, delta)
        return { ...e, date: shifted > today ? today : shifted }
      }),
    }
  } catch {
    return initialState(today)
  }
}

/**
 * The shared persistence shell around the board. Hydrate brings a saved copy
 * forward to today (`shiftSeed`) or, with no copy — nothing saved, or another
 * tab's Reset — falls back to a fresh seed; everything else is the shared
 * reducer's business (no-op edits return the same shell, hydrates never
 * write, `saved` follows the write's result).
 */
type Shell = PersistenceShell<State>

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        fallback: initialState(action.today),
        adopt: (saved) => shiftSeed(saved, action.today),
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", data: initialState(action.today) })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
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
    seededAt: today,
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board layout, chart choices and expense rows are saved to this browser's
 * localStorage, under the shared policy in `@/lib/persistence`: only after
 * a real edit, validated whole on load, with Reset clearing the key. Bump
 * the version whenever the seed or the shape changes (v1 froze the seed on
 * load and had no `seededAt`).
 */
export const STORAGE_KEY = "hotdash.metrics.v2"
export const LEGACY_STORAGE_KEYS = ["hotdash.metrics.v1"] as const

function isMetricId(value: unknown): value is MetricId {
  return isString(value) && (METRIC_IDS as readonly string[]).includes(value)
}

function isChartType(value: unknown): value is ChartType {
  return value === "bar" || value === "line"
}

function isExpense(value: unknown): value is Expense {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    isString(v.category) &&
    isFiniteNumber(v.amount) &&
    Number.isInteger(v.amount) &&
    v.amount >= 1 &&
    isIsoDay(v.date) &&
    isBoolean(v.recurring)
  )
}

/** The highest numeric suffix among exp-n ids; 0 when there are none. */
function highestExpenseId(expenses: readonly Expense[]) {
  return expenses.reduce((max, e) => {
    const m = /^exp-(\d+)$/.exec(e.id)
    const n = m ? Number(m[1]) : 0
    return n > max ? n : max
  }, 0)
}

/**
 * Every field is checked, not just the envelope: duplicate cards, an unknown
 * chart type, a date like 2026-13-45 or an id counter that would collide
 * all drop the copy for the seed rather than rendering half a page.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.visible) || !v.visible.every(isMetricId)) return false
  if (dedupe(v.visible).length !== v.visible.length) return false
  if (!v.charts || typeof v.charts !== "object" || Array.isArray(v.charts)) return false
  for (const [id, chart] of Object.entries(v.charts as Record<string, unknown>)) {
    if (!isMetricId(id) || !isChartType(chart)) return false
  }
  if (!Array.isArray(v.expenses) || !v.expenses.every(isExpense)) return false
  if (dedupe(v.expenses.map((e) => e.id)).length !== v.expenses.length) return false
  if (!isFiniteNumber(v.nextExpenseId) || !Number.isInteger(v.nextExpenseId)) return false
  if (v.nextExpenseId <= highestExpenseId(v.expenses)) return false
  if (!isIsoDay(v.seededAt)) return false
  return true
}

export const metricsStorage = createStorage<State>({
  key: STORAGE_KEY,
  legacyKeys: LEGACY_STORAGE_KEYS,
  validate: isState,
})

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return metricsStorage.load(storage).state
}

/** The saved copy brought up to `today`, or a fresh seed when there is none. */
export function loadStateOrSeed(storage: Storage | undefined, today: IsoDay): State {
  const saved = loadState(storage)
  return saved ? shiftSeed(saved, today) : initialState(today)
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return metricsStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  metricsStorage.clear(storage)
}

type Store = State &
  PersistenceStore & {
    /**
     * Today's calendar day (America/Chicago), read once per request on the
     * server and passed in, so SSR and hydration agree and nothing in the
     * tree reads the machine clock.
     */
    today: IsoDay
    addMetric: (id: MetricId) => void
    removeMetric: (id: MetricId) => void
    setChart: (id: MetricId, chart: ChartType) => void
    addExpense: (input: NewExpenseInput) => void
    removeExpense: (id: string) => void
  }

const MetricsContext = React.createContext<Store | null>(null)

export function MetricsProvider({
  today: requestToday,
  children,
}: {
  today: IsoDay
  children: React.ReactNode
}) {
  // Reset regenerates from the moment of the click, so after a Reset the
  // page's "today" is that day, not the request's.
  const [today, setToday] = React.useState(requestToday)

  const [shell, dispatch] = React.useReducer(shellReducer, requestToday, (day) =>
    initialShell(initialState(day))
  )
  const { data: state, persisted, edited, saved, saveFailed } = shell

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: metricsStorage.load(window.localStorage), today })
  }, [today])

  // Other tabs and writes, the shared way: a hydrate never writes; only a
  // moving edit count does. The result feeds the note.
  const onHydrate = React.useCallback(
    (result: LoadResult<State>) => dispatch({ type: "hydrate", result, today }),
    [today]
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: metricsStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today,
      persisted,
      edited,
      saved,
      saveFailed,
      addMetric: (id) => dispatch({ type: "add-metric", id }),
      removeMetric: (id) => dispatch({ type: "remove-metric", id }),
      setChart: (id, chart) => dispatch({ type: "set-chart", id, chart }),
      addExpense: (input) => dispatch({ type: "add-expense", input }),
      removeExpense: (id) => dispatch({ type: "remove-expense", id }),
      resetDemoData: () => {
        // Clear first, then regenerate from now: the browser returns to the
        // never-edited state and the seed is dated from this moment.
        clearState(window.localStorage)
        const day = todayIn(now())
        setToday(day)
        dispatch({ type: "reset", today: day })
      },
    }),
    [state, today, persisted, edited, saved, saveFailed]
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
