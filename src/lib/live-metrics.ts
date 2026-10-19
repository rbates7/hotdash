import { formatWallClock } from "@/lib/clock"
import type { Kpi } from "@/lib/home"
import { VS_PREVIOUS_WINDOW } from "@/lib/kpis"
import { formatCurrency, formatMetricValue, trendFor, type MetricId, type MetricSnapshot } from "@/lib/metrics"
import type { PosthogFeed } from "@/lib/posthog-summary"
import type { Rate } from "@/lib/stripe-metrics"
import { isAppStoreConnecting } from "@/lib/app-store-summary"
import type { StripeFeed } from "@/lib/stripe-summary"
import { breakdownNote, breakdownRows, subscriberTotal, type BreakdownRow } from "@/lib/subscriber-total"

/**
 * Which numbers come from Stripe or PostHog, and how a screen shows them.
 * No screen ever shows a fixture figure: fixtures are for tests only.
 *
 * - Not connected → no figure: the card says Not connected (its source has
 *                   no key) or names that no source feeds it yet.
 * - Connected     → Stripe's figure, no label.
 * - Stale         → Stripe's last figure, no label, "Last updated <time>".
 * - Loading       → a placeholder (never a sample number that then swaps),
 *                   also while the server's first sync is still connecting.
 *                   Subscribers stays loading until App Store has connected
 *                   too, so the total never lands without one of its groups.
 */

/**
 * The Metrics cards Stripe feeds. Subscribers is here as well as MRR,
 * Churn Rate and Trial Conversions so the card never disagrees with Home's
 * Subscribers card and ticker, which link to it. Subscribers is the total
 * (`subscriberTotal`: Stripe paying + App Store + free accounts), with
 * its breakdown.
 */
export const STRIPE_METRIC_IDS: ReadonlySet<MetricId> = new Set(["mrr", "churn", "trials", "subscribers"])

/**
 * The Metrics cards PostHog feeds: Active Users (an extra card, in "Add
 * metric") and Retention, which turns from the sample's subscriber
 * retention into app retention when live (its note says so). PostHog has
 * iOS app events only, from June 2026.
 */
export const POSTHOG_METRIC_IDS: ReadonlySet<MetricId> = new Set(["active", "retention"])

/** "Last updated Tue, Oct 13 · 9:41 PM CDT", on the shared clock, in the founder's zone. */
export function lastUpdatedLabel(at: Date, timeZone: string) {
  return `Last updated ${formatWallClock(at, timeZone)}`
}

/** A live (Stripe or PostHog) figure as a Metrics card shows it. */
export type LiveMetric = {
  source: "stripe" | "posthog"
  /** Null when there was nothing to divide by (no trials ended, nobody to churn). */
  value: number | null
  previous: number | null
  series: (number | null)[]
  /** "Last updated …" when stale; null when current. */
  updated: string | null
  /** Why `value` is null, in the card's words. */
  empty: string | null
  /** What the live figure counts, under the headline (PostHog's cards). */
  note?: string
  /** Subscribers only: the groups the total adds up. */
  breakdown?: SubscriberBreakdownView
}

/** The rows under a Subscribers total, and its fine print (or null). */
export type SubscriberBreakdownView = { rows: BreakdownRow[]; note: string | null }

/** Stripe's figures as the Subscribers total, with its breakdown. */
export function liveSubscribers(feed: Extract<StripeFeed, { kind: "live" }>, timeZone: string) {
  const total = subscriberTotal(feed.metrics, feed.appStore)
  const breakdown: SubscriberBreakdownView = { rows: breakdownRows(total), note: breakdownNote(total, timeZone) }
  return { total, breakdown }
}

/**
 * What a card shows:
 * - `not_connected` — no figure. `source` names what would feed it (no key
 *   yet), or is null when nothing feeds this card yet.
 * - `loading` — a placeholder; `connecting` while a source with a key runs
 *   its first sync (#50), so the card says Connecting….
 * - `live` — the source's figure.
 * - `entries` — Expenses only: the figure is the sum of rows typed into the
 *   Expenses tab in this browser, not an outside source.
 */
export type LiveState =
  | { kind: "entries" }
  | { kind: "not_connected"; source: LiveSource | null }
  | { kind: "loading"; connecting?: boolean }
  | { kind: "live"; metric: LiveMetric }

export type LiveSource = "stripe" | "posthog"

/** A card with no figure, and why. */
export const notConnected = (source: LiveSource | null): LiveState => ({ kind: "not_connected", source })

/** Which source would feed Metrics card `id`, or null when none does yet. */
export function sourceFor(id: MetricId): LiveSource | null {
  return STRIPE_METRIC_IDS.has(id) ? "stripe" : POSTHOG_METRIC_IDS.has(id) ? "posthog" : null
}

/** The card's one line when it has no figure, in the founder's words. */
export function notConnectedText(source: LiveSource | null): string {
  return source === "stripe"
    ? "No figures until Stripe is connected."
    : source === "posthog"
      ? "No figures until PostHog is connected."
      : "No source connected for this metric yet."
}

const EMPTY: Partial<Record<MetricId, string>> = {
  churn: "No subscribers at the start of the window",
  trials: "No trials ended in the last 28 days",
}

/** What the Metrics card `id` shows for this feed. */
export function liveMetric(id: MetricId, feed: StripeFeed, timeZone: string): LiveState {
  if (!STRIPE_METRIC_IDS.has(id)) return notConnected(sourceFor(id))
  if (feed.kind === "not_connected") return notConnected("stripe")
  if (feed.kind === "loading") return feed.connecting ? { kind: "loading", connecting: true } : { kind: "loading" }
  if (id === "subscribers" && isAppStoreConnecting(feed.appStore)) return { kind: "loading", connecting: true }
  const m = feed.metrics
  const subscribers = id === "subscribers" ? liveSubscribers(feed, timeZone) : null
  const source: { value: Rate; previous: Rate; series: Rate[] } =
    id === "mrr" ? m.mrr : id === "churn" ? m.churn : id === "trials" ? m.trialToPaid : subscribers!.total
  return {
    kind: "live",
    metric: {
      source: "stripe",
      value: source.value,
      previous: source.previous,
      series: source.series,
      updated: feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null,
      empty: source.value === null ? (EMPTY[id] ?? "No data yet") : null,
      ...(subscribers && { breakdown: subscribers.breakdown }),
    },
  }
}

const count = (n: number) => n.toLocaleString("en-US")

/** What the Metrics card `id` shows from PostHog's feed. */
export function posthogMetric(id: MetricId, feed: PosthogFeed, timeZone: string): LiveState {
  if (!POSTHOG_METRIC_IDS.has(id)) return notConnected(sourceFor(id))
  if (feed.kind === "not_connected") return notConnected("posthog")
  if (feed.kind === "loading") return { kind: "loading" }
  const updated = feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null
  if (id === "active") {
    const a = feed.metrics.activeUsers
    return {
      kind: "live",
      metric: {
        source: "posthog",
        value: a.value,
        previous: a.previous,
        series: a.series,
        updated,
        empty: a.value === null ? "PostHog has under 28 days of app events" : null,
        note: `iOS app · ${count(a.day)} in 24 h · ${count(a.week)} in 7 days`,
      },
    }
  }
  const r = feed.metrics.retention
  return {
    kind: "live",
    metric: {
      source: "posthog",
      value: r.value,
      previous: r.previous,
      series: r.series,
      updated,
      empty:
        r.value !== null ? null : r.base === 0 ? "No app users in the 28 days before" : "PostHog has under 56 days of app events",
      note:
        r.base && r.retained !== null
          ? `iOS app · ${count(r.retained)} of ${count(r.base)} users came back`
          : "iOS app users active again within 28 days",
    },
  }
}

/** What Metrics card `id` shows: PostHog's figure for its cards, Stripe's for Stripe's, Not connected otherwise. */
export function liveCard(id: MetricId, stripe: StripeFeed, posthog: PosthogFeed, timeZone: string): LiveState {
  if (id === "expenses") return { kind: "entries" }
  return POSTHOG_METRIC_IDS.has(id) ? posthogMetric(id, posthog, timeZone) : liveMetric(id, stripe, timeZone)
}

/** The headline as the card prints it: the unit's format, or an em dash with nothing to show. */
export function liveValueText(metric: Pick<LiveMetric, "value">, unit: MetricSnapshot["unit"]) {
  return metric.value === null ? "—" : formatMetricValue(metric.value, unit)
}

/* ------------------------------------------------------------------ Home */

/** The cash card compares Monday-to-now against last week to the same point. */
/** Fine print on the Stripe-fed money figures (Mack, PR #42 round 1). */
export const CASH_NOTE = "Gross, before refunds"
export const MRR_NOTE = "USD only · past points use today\u2019s prices"

export const VS_SAME_POINT_LAST_WEEK = "vs same time last week"

function direction(t: ReturnType<typeof trendFor>): Kpi["direction"] {
  return t.flat ? "flat" : t.up ? "up" : "down"
}

/** A KPI card with no figure: an em dash, no delta, never a fixture number. */
export function notConnectedKpi(kpi: Kpi): Kpi {
  return { id: kpi.id, label: kpi.label, value: "\u2014", delta: "", direction: "flat", source: "not_connected" }
}

/**
 * Home's KPI cards from Stripe's feed. `kpis` supplies only the cards'
 * ids and labels: a card Stripe feeds shows Stripe's figure (or a
 * placeholder while it loads or connects); every other card, and every
 * card while Stripe has no key, is Not connected. No fixture figure ever
 * passes through.
 */
export function liveKpis(kpis: readonly Kpi[], feed: StripeFeed, snapshots: (id: MetricId) => MetricSnapshot, timeZone: string): Kpi[] {
  return kpis.map((kpi): Kpi => {
    const isCash = kpi.id === "cash-this-week"
    const isMetric = STRIPE_METRIC_IDS.has(kpi.id as MetricId)
    if ((!isCash && !isMetric) || feed.kind === "not_connected") return notConnectedKpi(kpi)
    const loading = (connecting: boolean): Kpi => ({
      id: kpi.id,
      label: kpi.label,
      value: "–",
      delta: "",
      direction: "flat",
      source: "loading",
      ...(connecting && { connecting: true }),
    })
    if (feed.kind === "loading") return loading(Boolean(feed.connecting))
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
    if (state.kind === "loading") return loading(Boolean(state.connecting))
    if (state.kind !== "live") return notConnectedKpi(kpi)
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
      ...(state.metric.breakdown && { breakdown: state.metric.breakdown }),
    }
  })
}
