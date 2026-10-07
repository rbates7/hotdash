import {
  expensesTotal,
  valuationFromArr,
  type ChurnedSubscriber,
  type Expense,
  type MetricDef,
  type MetricId,
  type MetricSnapshot,
  type NewSubscriber,
} from "@/lib/metrics"

/**
 * Dummy numbers for the Metrics mock (`founder-dashboard-metrics-v0`).
 * Nothing here is wired to Stripe, Supabase or PostHog yet.
 */

/** The decorative range in the page header. Not a working picker yet. */
export const DATE_RANGE_LABEL = "25 Jul – 21 Aug 2026"

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
 * Six months per metric, oldest first; the last two are last month and
 * now. Expenses and Valuation are derived (see `snapshotFor`), so their
 * final point is filled in at read time.
 */
const SERIES: Record<MetricId, number[]> = {
  mrr: [23_800, 24_200, 24_900, 25_100, 25_130, 26_190],
  arr: [285_600, 290_400, 298_800, 301_200, 301_560, 314_280],
  churn: [4.4, 4.3, 4.3, 4.2, 4.2, 3.8],
  revenue: [24_800, 25_200, 26_100, 26_400, 26_780, 28_410],
  retention: [95.6, 95.7, 95.8, 95.8, 95.8, 96.2],
  subscribers: [158, 164, 169, 172, 174, 186],
  trials: [22, 23, 24, 24.5, 24.9, 28],
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

/**
 * Resolve a metric's numbers. Expenses is the live total of the expense
 * table so adding a line item moves the card; Valuation is ARR × 3.5.
 */
export function snapshotFor(
  id: MetricId,
  expenses: readonly Expense[]
): MetricSnapshot {
  const def = METRIC_DEFS[id]
  const series = [...SERIES[id]]
  if (id === "expenses") series[series.length - 1] = expensesTotal(expenses)
  if (id === "valuation") {
    series[series.length - 1] = valuationFromArr(SERIES.arr[SERIES.arr.length - 1])
  }
  return {
    ...def,
    value: series[series.length - 1],
    previous: series[series.length - 2],
    series,
  }
}

/* ------------------------------------------------------------- expenses */

export const expenses: Expense[] = [
  { id: "exp-1", category: "AWS", amount: 5_410, date: "2026-08-18", recurring: true },
  // The mock's rows sum to $8,104 against a card reading $8,240; Stripe fees
  // absorb the gap so the derived card lands on the mock's headline number.
  { id: "exp-2", category: "Stripe fees", amount: 1_978, date: "2026-08-21", recurring: false },
  { id: "exp-3", category: "Cursor", amount: 320, date: "2026-08-01", recurring: true },
  { id: "exp-4", category: "Google Workspace", amount: 288, date: "2026-08-08", recurring: true },
  { id: "exp-5", category: "Apple Developer", amount: 99, date: "2026-08-15", recurring: true },
  { id: "exp-6", category: "Figma", amount: 75, date: "2026-08-12", recurring: true },
  { id: "exp-7", category: "Notion", amount: 48, date: "2026-08-04", recurring: true },
  { id: "exp-8", category: "Domain", amount: 22, date: "2026-08-03", recurring: false },
]

/* ---------------------------------------------------------- subscribers */

export const newSubscribers: NewSubscriber[] = [
  { id: "ns-1", name: "Alisha Patel", email: "apatel@canyonridgesports.com", plan: "Monthly", signupDate: "2026-08-18" },
  { id: "ns-2", name: "Jamal Reeves", email: "jreeves@oakmontcoaches.net", plan: "Staff", signupDate: "2026-08-11" },
  { id: "ns-3", name: "Priya Shah", email: "priya.shah@riverbendhs.org", plan: "Annual", signupDate: "2026-08-06" },
  { id: "ns-4", name: "Marcus Hale", email: "mhale@westfieldfb.org", plan: "Annual", signupDate: "2026-08-03" },
  { id: "ns-5", name: "Colin Brooks", email: "cbrooks@highlandathletics.com", plan: "Monthly", signupDate: "2026-07-31" },
  { id: "ns-6", name: "Denise Okonkwo", email: "denise.o@lakeridgeathletics.com", plan: "Monthly", signupDate: "2026-07-28" },
  { id: "ns-7", name: "Elena Vasquez", email: "elena.v@southforkfb.net", plan: "Annual", signupDate: "2026-07-25" },
  { id: "ns-8", name: "Troy Nguyen", email: "troy.nguyen@northsideprep.edu", plan: "Annual", signupDate: "2026-07-22" },
]

export const churnedSubscribers: ChurnedSubscriber[] = [
  { id: "cs-1", name: "Brett Holloway", email: "b.holloway@meadowpark.edu", signupDate: "2026-01-12", churnDate: "2026-08-08", lifetimeValue: 199 },
  { id: "cs-2", name: "Nina Cho", email: "nina.cho@coastalprep.org", signupDate: "2025-09-04", churnDate: "2026-08-02", lifetimeValue: 398 },
  { id: "cs-3", name: "Derek Fontaine", email: "dfontaine@ironwoodfb.com", signupDate: "2026-03-19", churnDate: "2026-07-29", lifetimeValue: 79 },
  { id: "cs-4", name: "Tamara Ellis", email: "tellis@prairieviewathletics.net", signupDate: "2025-11-07", churnDate: "2026-07-21", lifetimeValue: 199 },
  { id: "cs-5", name: "Omar Siddiqui", email: "omar.s@ridgecresths.org", signupDate: "2026-02-02", churnDate: "2026-07-15", lifetimeValue: 398 },
]
