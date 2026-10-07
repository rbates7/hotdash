import {
  addDays,
  inPeriod,
  periodBefore,
  periodEnding,
  toDay,
  type IsoDay,
  type Period,
} from "@/lib/clock"
import type { Kpi } from "@/lib/home"
import {
  expensesTotal,
  formatMetricValue,
  trendFor,
  valuationFromArr,
  type ChurnedSubscriber,
  type Expense,
  type MetricDef,
  type MetricId,
  type MetricSnapshot,
  type NewSubscriber,
} from "@/lib/metrics"

/**
 * The one set of business numbers for the dashboard. Home's truth strip,
 * Home's Metrics door and the Metrics page all read from here, so they can
 * never disagree. Everything is dummy (nothing is wired to Stripe, Supabase
 * or PostHog yet) and everything is relative to the real clock: pass the
 * request's `today` and the seed lands around it.
 */

/**
 * The day the Metrics mock was drawn. Seed rows are day offsets so that
 * `seedX(MOCK_DAY)` reproduces the mock, while on any other day the same
 * rows sit the same distance behind "today" and inside its period.
 */
export const MOCK_DAY: IsoDay = "2026-08-21"

export const METRIC_DEFS: Record<MetricId, MetricDef> = {
  mrr: { id: "mrr", label: "MRR", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  arr: { id: "arr", label: "ARR", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  churn: { id: "churn", label: "Churn Rate", unit: "percent", trendKind: "pts", lowerIsBetter: true, defaultChart: "line" },
  revenue: { id: "revenue", label: "Revenue", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  retention: { id: "retention", label: "Retention", unit: "percent", trendKind: "pts", defaultChart: "line" },
  subscribers: { id: "subscribers", label: "Subscribers", unit: "count", trendKind: "abs", defaultChart: "bar" },
  trials: { id: "trials", label: "Trial Conversions", unit: "percent", trendKind: "pts", defaultChart: "line" },
  expenses: { id: "expenses", label: "Expenses", unit: "currency", trendKind: "percent", lowerIsBetter: true, defaultChart: "bar" },
  cac: { id: "cac", label: "CAC", unit: "currency", trendKind: "percent", lowerIsBetter: true, defaultChart: "bar" },
  ltv: { id: "ltv", label: "LTV", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  arpu: { id: "arpu", label: "ARPU", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  nrr: { id: "nrr", label: "NRR", unit: "percent", trendKind: "pts", defaultChart: "line" },
  runway: { id: "runway", label: "Runway", unit: "months", trendKind: "abs", defaultChart: "bar" },
  nps: { id: "nps", label: "NPS", unit: "count", trendKind: "abs", defaultChart: "line" },
  valuation: {
    id: "valuation",
    label: "Valuation",
    unit: "currency-millions",
    trendKind: "percent",
    defaultChart: "bar",
    note: "ARR × 3.5 · illustrative only",
  },
}

/**
 * Six periods per metric, oldest first; the last two are the prior period
 * and now. Three are derived (see `snapshotFor`): Expenses sums the table,
 * Subscribers reconciles with the subscriber tables, Valuation is ARR × 3.5.
 */
const SERIES: Record<MetricId, number[]> = {
  mrr: [23_800, 24_200, 24_900, 25_100, 25_130, 26_190],
  arr: [285_600, 290_400, 298_800, 301_200, 301_560, 314_280],
  churn: [4.4, 4.3, 4.3, 4.2, 4.2, 3.8],
  revenue: [24_800, 25_200, 26_100, 26_400, 26_780, 28_410],
  retention: [95.6, 95.7, 95.8, 95.8, 95.8, 96.2],
  subscribers: [158, 164, 169, 172, 0, 186],
  trials: [22, 23, 24, 24.5, 24.9, 28],
  // The second-to-last point is the prior period's total; the last is
  // summed live from the table.
  expenses: [7_800, 7_900, 7_960, 8_000, 8_050, 0],
  cac: [168, 162, 160, 158, 155, 142],
  ltv: [1_520, 1_560, 1_590, 1_600, 1_620, 1_680],
  arpu: [132, 134, 136, 137, 138, 141],
  nrr: [104, 105, 105.5, 106, 106.8, 108],
  runway: [11, 12, 12, 12, 12, 14],
  nps: [44, 46, 47, 48, 48, 52],
  valuation: [285_600, 290_400, 298_800, 301_200, 301_560, 0].map((arr) =>
    valuationFromArr(arr)
  ),
}

/** What the derived metrics need besides their series. */
export type KpiContext = {
  today: IsoDay | Date
  /** The expense table — the live rows when the store has them. */
  expenses?: readonly Expense[]
}

/**
 * The prior period's expenses: the series baseline, plus any table rows
 * that are dated inside it (a user's older entries), so the comparison is
 * against the same window one period back.
 */
export function priorExpensesTotal(expenses: readonly Expense[], period: Period) {
  return SERIES.expenses[SERIES.expenses.length - 2] + expensesTotal(expenses, periodBefore(period))
}

/** Resolve a metric's numbers for `today`. */
export function snapshotFor(id: MetricId, ctx: KpiContext): MetricSnapshot {
  const today = toDay(ctx.today)
  const period = periodEnding(today)
  const def = METRIC_DEFS[id]
  const series = [...SERIES[id]]
  const last = series.length - 1

  if (id === "expenses") {
    const rows = ctx.expenses ?? seedExpenses(today)
    series[last] = expensesTotal(rows, period)
    series[last - 1] = priorExpensesTotal(rows, period)
  }
  if (id === "subscribers") {
    // Last period's count is this period's less the net adds the tables show.
    const net = seedNewSubscribers(today).length - seedChurnedSubscribers(today).length
    series[last - 1] = series[last] - net
  }
  if (id === "valuation") {
    series[last] = valuationFromArr(SERIES.arr[SERIES.arr.length - 1])
  }

  return {
    ...def,
    value: series[last],
    previous: series[last - 1],
    series,
  }
}

/* --------------------------------------------------------------- home */

/** Home's truth strip: are coaches paying, and is cash arriving this week. */
export function truthStrip(ctx: KpiContext): Kpi[] {
  const subscribers = snapshotFor("subscribers", ctx)
  const revenue = snapshotFor("revenue", ctx)
  // One week of the 28-day Revenue period, this period and last.
  const cash = { value: revenue.value / 4, previous: revenue.previous / 4 }
  const cashTrend = trendFor(cash.value, cash.previous, "percent")
  return [
    toKpi(subscribers, "vs last month"),
    {
      id: "cash-this-week",
      label: "Cash this week",
      value: `$${Math.round(cash.value).toLocaleString("en-US")}`,
      delta: `${cashTrend.text} vs last week`,
      direction: cashTrend.flat ? "flat" : cashTrend.up ? "up" : "down",
    },
  ]
}

/** Home's growth set: the Metrics cards it mirrors, same numbers. */
export function growthStrip(ctx: KpiContext): Kpi[] {
  return (["mrr", "arr", "subscribers", "churn"] as const).map((id) =>
    toKpi(snapshotFor(id, ctx), "")
  )
}

/** The series behind Home's Metrics door — the Metrics MRR card's own. */
export function mrrTrend(ctx: KpiContext): number[] {
  return snapshotFor("mrr", ctx).series
}

function toKpi(snap: MetricSnapshot, suffix: string): Kpi {
  const t = trendFor(snap.value, snap.previous, snap.trendKind, {
    lowerIsBetter: snap.lowerIsBetter,
    unit: snap.unit,
  })
  return {
    id: snap.id,
    label: snap.label,
    value: formatMetricValue(snap.value, snap.unit),
    delta: suffix ? `${t.text} ${suffix}` : t.text,
    direction: t.flat ? "flat" : t.up ? "up" : "down",
    lowerIsBetter: snap.lowerIsBetter,
  }
}

/* ------------------------------------------------------------- expenses */

/** Eight rows, every one inside the trailing four weeks ending `today`. */
export function seedExpenses(today: IsoDay | Date): Expense[] {
  const d = (offset: number) => addDays(today, offset)
  return [
    { id: "exp-1", category: "AWS", amount: 5_410, date: d(-3), recurring: true },
    // The mock's rows sum to $8,104 against a card reading $8,240; Stripe fees
    // absorb the gap so the derived card lands on the mock's headline number.
    { id: "exp-2", category: "Stripe fees", amount: 1_978, date: d(0), recurring: false },
    { id: "exp-3", category: "Cursor", amount: 320, date: d(-20), recurring: true },
    { id: "exp-4", category: "Google Workspace", amount: 288, date: d(-13), recurring: true },
    { id: "exp-5", category: "Apple Developer", amount: 99, date: d(-6), recurring: true },
    { id: "exp-6", category: "Figma", amount: 75, date: d(-9), recurring: true },
    { id: "exp-7", category: "Notion", amount: 48, date: d(-17), recurring: true },
    { id: "exp-8", category: "Domain", amount: 22, date: d(-18), recurring: false },
  ]
}

/** Ids the seed uses; anything else was entered by the user. */
export const SEED_EXPENSE_IDS: ReadonlySet<string> = new Set(seedExpenses(MOCK_DAY).map((e) => e.id))

/* ---------------------------------------------------------- subscribers */

/** Eight sign-ups, newest first, all inside the period. */
export function seedNewSubscribers(today: IsoDay | Date): NewSubscriber[] {
  const d = (offset: number) => addDays(today, offset)
  return [
    { id: "ns-1", name: "Alisha Patel", email: "apatel@canyonridgesports.com", plan: "Monthly", signupDate: d(-3) },
    { id: "ns-2", name: "Jamal Reeves", email: "jreeves@oakmontcoaches.net", plan: "Staff", signupDate: d(-10) },
    { id: "ns-3", name: "Priya Shah", email: "priya.shah@riverbendhs.org", plan: "Annual", signupDate: d(-15) },
    { id: "ns-4", name: "Marcus Hale", email: "mhale@westfieldfb.org", plan: "Annual", signupDate: d(-18) },
    { id: "ns-5", name: "Colin Brooks", email: "cbrooks@highlandathletics.com", plan: "Monthly", signupDate: d(-21) },
    { id: "ns-6", name: "Denise Okonkwo", email: "denise.o@lakeridgeathletics.com", plan: "Monthly", signupDate: d(-24) },
    { id: "ns-7", name: "Elena Vasquez", email: "elena.v@southforkfb.net", plan: "Annual", signupDate: d(-26) },
    { id: "ns-8", name: "Troy Nguyen", email: "troy.nguyen@northsideprep.edu", plan: "Annual", signupDate: d(-27) },
  ]
}

/** Five churns inside the period; their sign-ups are months earlier, as churn is. */
export function seedChurnedSubscribers(today: IsoDay | Date): ChurnedSubscriber[] {
  const d = (offset: number) => addDays(today, offset)
  return [
    { id: "cs-1", name: "Brett Holloway", email: "b.holloway@meadowpark.edu", signupDate: d(-221), churnDate: d(-13), lifetimeValue: 199 },
    { id: "cs-2", name: "Nina Cho", email: "nina.cho@coastalprep.org", signupDate: d(-351), churnDate: d(-19), lifetimeValue: 398 },
    { id: "cs-3", name: "Derek Fontaine", email: "dfontaine@ironwoodfb.com", signupDate: d(-155), churnDate: d(-23), lifetimeValue: 79 },
    { id: "cs-4", name: "Tamara Ellis", email: "tellis@prairieviewathletics.net", signupDate: d(-287), churnDate: d(-25), lifetimeValue: 199 },
    { id: "cs-5", name: "Omar Siddiqui", email: "omar.s@ridgecresths.org", signupDate: d(-200), churnDate: d(-27), lifetimeValue: 398 },
  ]
}

/** Every dated event the seed shows for `today`'s period, for reconciliation tests. */
export function seedEventDates(today: IsoDay | Date): IsoDay[] {
  return [
    ...seedExpenses(today).map((e) => e.date),
    ...seedNewSubscribers(today).map((s) => s.signupDate),
    ...seedChurnedSubscribers(today).map((s) => s.churnDate),
  ]
}

export { inPeriod }
