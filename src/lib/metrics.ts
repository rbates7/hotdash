/**
 * Metrics page domain: metric definitions, trend math and formatting.
 * Numbers are dummy by design (reqs: "Dummy/invented numbers throughout");
 * the math here is real so the cards stay self-consistent when the user
 * changes what they are derived from.
 */

export const DEFAULT_METRIC_IDS = [
  "mrr",
  "arr",
  "churn",
  "revenue",
  "retention",
  "subscribers",
  "trials",
  "expenses",
] as const

export const EXTRA_METRIC_IDS = [
  "cac",
  "ltv",
  "arpu",
  "nrr",
  "runway",
  "nps",
  "valuation",
] as const

export type MetricId =
  | (typeof DEFAULT_METRIC_IDS)[number]
  | (typeof EXTRA_METRIC_IDS)[number]

export const METRIC_IDS: readonly MetricId[] = [
  ...DEFAULT_METRIC_IDS,
  ...EXTRA_METRIC_IDS,
]

export type ChartType = "bar" | "line"

/** How the headline number is printed. */
export type MetricUnit = "currency" | "currency-millions" | "percent" | "count" | "months"

/** How the change against last month is printed. */
export type TrendKind = "percent" | "pts" | "abs"

export type MetricDef = {
  id: MetricId
  label: string
  unit: MetricUnit
  trendKind: TrendKind
  /** Costs and churn: going down is the good direction. */
  lowerIsBetter?: boolean
  defaultChart: ChartType
  /** Small line under the number, e.g. how an illustrative figure is derived. */
  note?: string
}

/** A metric with its numbers resolved for the current period. */
export type MetricSnapshot = MetricDef & {
  /** Current value. */
  value: number
  /** Last month's value, the comparison baseline. */
  previous: number
  /** Six points, oldest first, ending on `value`. */
  series: number[]
}

export type Trend = {
  /** Signed change, in the metric's own unit. */
  delta: number
  /** Formatted with the sign, e.g. "+4.2%", "−0.4 pts", "+12", "+2 mo". */
  text: string
  up: boolean
  /** Whether the move is in the desired direction. */
  good: boolean
  /** No movement at all; render without colour or arrow. */
  flat: boolean
}

export type Expense = {
  id: string
  category: string
  /** Whole dollars. */
  amount: number
  /** ISO calendar date, YYYY-MM-DD. */
  date: string
  recurring: boolean
}

export type Plan = "Monthly" | "Annual" | "Staff"

export type NewSubscriber = {
  id: string
  name: string
  email: string
  plan: Plan
  signupDate: string
}

export type ChurnedSubscriber = {
  id: string
  name: string
  email: string
  signupDate: string
  churnDate: string
  lifetimeValue: number
}

/* --------------------------------------------------------------- numbers */

const MINUS = "\u2212"

function signed(n: number, digits: number) {
  const abs = Math.abs(n).toFixed(digits)
  if (Number(abs) === 0) return `±${abs}`
  return `${n > 0 ? "+" : MINUS}${abs}`
}

/** Up to `maxDigits` decimals, trailing zeros dropped: 3.8 → "3.8", 28 → "28". */
export function trimDecimals(n: number, maxDigits = 1) {
  return Number(n.toFixed(maxDigits)).toString()
}

export function formatCurrency(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function formatMetricValue(value: number, unit: MetricUnit) {
  switch (unit) {
    case "currency":
      return formatCurrency(value)
    case "currency-millions":
      return `$${(value / 1_000_000).toFixed(2)}M`
    case "percent":
      return `${trimDecimals(value)}%`
    case "count":
      return Math.round(value).toLocaleString("en-US")
    case "months":
      return `${trimDecimals(value)} mo`
  }
}

/** Change against last month, in the shape the trend pill prints. */
export function trendFor(
  value: number,
  previous: number,
  kind: TrendKind,
  opts: { lowerIsBetter?: boolean; unit?: MetricUnit } = {}
): Trend {
  const delta = value - previous
  const flat = Math.abs(delta) < 1e-9
  const up = delta > 0
  const good = flat ? true : opts.lowerIsBetter ? !up : up

  let text: string
  switch (kind) {
    case "percent": {
      const pct = previous === 0 ? 0 : (delta / Math.abs(previous)) * 100
      text = `${signed(pct, 1)}%`
      break
    }
    case "pts":
      text = `${signed(delta, 1)} pts`
      break
    case "abs":
      text = signed(delta, 0)
      if (opts.unit === "months") text += " mo"
      break
  }

  return { delta, text, up, good, flat }
}

/* ---------------------------------------------------------------- derived */

/** ARR × 3.5 — illustrative only, per the reqs. */
export const VALUATION_MULTIPLE = 3.5

export function valuationFromArr(arr: number) {
  return arr * VALUATION_MULTIPLE
}

export function expensesTotal(expenses: readonly Expense[]) {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}

/**
 * Which metrics the "+ Add metric" picker offers: the extras first (they
 * are hidden by default), then any default card the user removed.
 */
export function pickerIds(visible: readonly MetricId[]): MetricId[] {
  return [...EXTRA_METRIC_IDS, ...DEFAULT_METRIC_IDS].filter(
    (id) => !visible.includes(id)
  )
}

/* --------------------------------------------------------------- sorting */

export type SortDir = "asc" | "desc"

export type Sort<K extends string> = { key: K; dir: SortDir }

/**
 * Sort rows by one column. Strings compare case-insensitively, numbers and
 * ISO dates compare naturally (ISO dates sort correctly as strings).
 */
export function sortRows<T, K extends keyof T & string>(
  rows: readonly T[],
  sort: Sort<K> | null
): T[] {
  if (!sort) return [...rows]
  const sign = sort.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = a[sort.key]
    const y = b[sort.key]
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign
    if (typeof x === "boolean" && typeof y === "boolean") {
      return (Number(x) - Number(y)) * sign
    }
    return (
      String(x).localeCompare(String(y), "en", { sensitivity: "base" }) * sign
    )
  })
}

/** Click the active column to flip it; click another to sort it ascending. */
export function toggleSort<K extends string>(
  current: Sort<K> | null,
  key: K,
  defaultDir: SortDir = "asc"
): Sort<K> {
  if (current?.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" }
  }
  return { key, dir: defaultDir }
}
