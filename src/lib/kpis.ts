import { addDays, inPeriod, toDay, type IsoDay, type Period } from "@/lib/clock"
import type { MetricDef, MetricId, MetricSnapshot } from "@/lib/metrics"

/**
 * What every Metrics card and Home KPI is: its label, unit and trend rule.
 * No figures: Rashad's Oct 16 rule. A number on screen comes only from a
 * live source (Stripe, PostHog, Chlk's database) or the founder's own
 * entries (`@/lib/live-metrics`); anything else shows #50's Not connected.
 * The old invented series live in `@/lib/kpis-fixture`, for tests only.
 */

export const METRIC_DEFS: Record<MetricId, MetricDef> = {
  mrr: { id: "mrr", label: "MRR", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  arr: { id: "arr", label: "ARR", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  churn: { id: "churn", label: "Churn Rate", unit: "percent", trendKind: "pts", lowerIsBetter: true, defaultChart: "line" },
  revenue: { id: "revenue", label: "Revenue", unit: "currency", trendKind: "percent", defaultChart: "bar" },
  retention: { id: "retention", label: "Retention", unit: "percent", trendKind: "pts", defaultChart: "line" },
  subscribers: { id: "subscribers", label: "Subscribers", unit: "count", trendKind: "abs", defaultChart: "bar" },
  trials: { id: "trials", label: "Trial Conversions", unit: "percent", trendKind: "pts", defaultChart: "line" },
  trials_per_day: { id: "trials_per_day", label: "Trials per day", unit: "count", trendKind: "percent", defaultChart: "bar" },
  expenses: { id: "expenses", label: "Expenses", unit: "currency", trendKind: "percent", lowerIsBetter: true, defaultChart: "bar" },
  active: { id: "active", label: "Active Users", unit: "count", trendKind: "percent", defaultChart: "bar" },
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
 * A card's definition in the shape the card components take, with no
 * figure: value and previous are 0 and the series is empty. Never rendered
 * as a number: the card shows its live state (`liveCard`) or Not connected.
 */
export function metricShell(id: MetricId): MetricSnapshot {
  return { ...METRIC_DEFS[id], value: 0, previous: 0, series: [] }
}

/** The trailing 7 days ending today, and the 7 before: the truth strip's "week". */
export function weekEnding(today: IsoDay | Date): { thisWeek: Period; lastWeek: Period } {
  const end = toDay(today)
  return {
    thisWeek: { start: addDays(end, -6), end },
    lastWeek: { start: addDays(end, -13), end: addDays(end, -7) },
  }
}

/** How every 28-day comparison is labelled, on Home and on Metrics. */
export const VS_PREVIOUS_WINDOW = "vs previous 28 days"
export const VS_PREVIOUS_WEEK = "vs previous 7 days"

/**
 * Ids the old Expenses seed used (`exp-1`…`exp-8`); a browser copy saved
 * before the seed was removed still holds them, and they are dropped.
 * Anything else was entered by the founder.
 */
export const SEED_EXPENSE_IDS: ReadonlySet<string> = new Set(Array.from({ length: 8 }, (_, i) => `exp-${i + 1}`))

export { inPeriod }
