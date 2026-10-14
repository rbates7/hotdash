import { formatWallClock } from "@/lib/clock"
import type { Kpi } from "@/lib/home"
import { VS_PREVIOUS_WINDOW } from "@/lib/kpis"
import { formatCurrency, formatMetricValue, trendFor, type MetricId, type MetricSnapshot } from "@/lib/metrics"
import type { Rate } from "@/lib/stripe-metrics"
import type { StripeFeed } from "@/lib/stripe-summary"

/**
 * Which numbers come from Stripe, and how a screen shows them. Everything
 * else on Home and Metrics stays sample, labelled.
 *
 * - Not connected → the sample figure with its Sample label, as before.
 * - Connected     → Stripe's figure, no label.
 * - Stale         → Stripe's last figure, no label, "Last updated <time>".
 * - Loading       → a placeholder (never a sample number that then swaps).
 */

/**
 * The Metrics cards Stripe feeds. Subscribers is here as well as MRR,
 * Churn Rate and Trial Conversions so the card never disagrees with Home's
 * Subscribers card and ticker, which link to it.
 */
export const STRIPE_METRIC_IDS: ReadonlySet<MetricId> = new Set(["mrr", "churn", "trials", "subscribers"])

/** "Last updated Tue, Oct 13 · 9:41 PM CDT", on the shared clock, in the founder's zone. */
export function lastUpdatedLabel(at: Date, timeZone: string) {
  return `Last updated ${formatWallClock(at, timeZone)}`
}

/** A Stripe figure as a Metrics card shows it. */
export type LiveMetric = {
  /** Null when there was nothing to divide by (no trials ended, nobody to churn). */
  value: number | null
  previous: number | null
  series: (number | null)[]
  /** "Last updated …" when stale; null when current. */
  updated: string | null
  /** Why `value` is null, in the card's words. */
  empty: string | null
}

export type LiveState = { kind: "sample" } | { kind: "loading" } | { kind: "live"; metric: LiveMetric }

const EMPTY: Partial<Record<MetricId, string>> = {
  churn: "No subscribers at the start of the window",
  trials: "No trials ended in the last 28 days",
}

/** What the Metrics card `id` shows for this feed. */
export function liveMetric(id: MetricId, feed: StripeFeed, timeZone: string): LiveState {
  if (!STRIPE_METRIC_IDS.has(id) || feed.kind === "sample") return { kind: "sample" }
  if (feed.kind === "loading") return { kind: "loading" }
  const m = feed.metrics
  const source: { value: Rate; previous: Rate; series: Rate[] } =
    id === "mrr" ? m.mrr : id === "churn" ? m.churn : id === "trials" ? m.trialToPaid : m.subscribers
  return {
    kind: "live",
    metric: {
      value: source.value,
      previous: source.previous,
      series: source.series,
      updated: feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null,
      empty: source.value === null ? (EMPTY[id] ?? "No data yet") : null,
    },
  }
}

/** The headline as the card prints it: the unit's format, or an em dash with nothing to show. */
export function liveValueText(metric: Pick<LiveMetric, "value">, unit: MetricSnapshot["unit"]) {
  return metric.value === null ? "—" : formatMetricValue(metric.value, unit)
}

/* ------------------------------------------------------------------ Home */

/** The cash card compares Monday-to-now against last week to the same point. */
export const VS_SAME_POINT_LAST_WEEK = "vs same time last week"

function direction(t: ReturnType<typeof trendFor>): Kpi["direction"] {
  return t.flat ? "flat" : t.up ? "up" : "down"
}

/**
 * Home's KPI cards with Stripe's figures swapped in where Stripe feeds
 * them (Subscribers and Cash this week on the truth strip; MRR, Subscribers
 * and Churn if the growth set is on). Others pass through as sample.
 */
export function liveKpis(kpis: readonly Kpi[], feed: StripeFeed, snapshots: (id: MetricId) => MetricSnapshot, timeZone: string): Kpi[] {
  return kpis.map((kpi) => {
    const isCash = kpi.id === "cash-this-week"
    const isMetric = STRIPE_METRIC_IDS.has(kpi.id as MetricId)
    if ((!isCash && !isMetric) || feed.kind === "sample") return kpi
    if (feed.kind === "loading") {
      return { ...kpi, value: "–", delta: "", direction: "flat", source: "loading" }
    }
    const updated = feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null
    if (isCash) {
      const { value, previous } = feed.metrics.cashThisWeek
      const t = trendFor(value, previous, "percent")
      return {
        ...kpi,
        value: formatCurrency(value),
        delta: `${t.text} ${VS_SAME_POINT_LAST_WEEK}`,
        direction: direction(t),
        source: "stripe",
        updated,
      }
    }
    const snap = snapshots(kpi.id as MetricId)
    const state = liveMetric(kpi.id as MetricId, feed, timeZone)
    if (state.kind !== "live") return kpi
    const { value, previous } = state.metric
    if (value === null) {
      return { ...kpi, value: "—", delta: state.metric.empty ?? "", direction: "flat", source: "stripe", updated }
    }
    const t = previous === null ? null : trendFor(value, previous, snap.trendKind, { lowerIsBetter: snap.lowerIsBetter, unit: snap.unit })
    return {
      ...kpi,
      value: formatMetricValue(value, snap.unit),
      delta: t ? `${t.text} ${VS_PREVIOUS_WINDOW}` : "",
      direction: t ? direction(t) : "flat",
      source: "stripe",
      updated,
    }
  })
}
