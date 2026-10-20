import { formatWallClock, periodBefore, periodEnding, type IsoDay } from "@/lib/clock"
import type { Kpi } from "@/lib/home"
import { SEED_EXPENSE_IDS, VS_PREVIOUS_WINDOW } from "@/lib/kpis"
import {
  expensesTotal,
  formatCurrency,
  formatMetricValue,
  trendFor,
  type Expense,
  type MetricId,
  type MetricSnapshot,
} from "@/lib/metrics"
import type { PosthogFeed } from "@/lib/posthog-summary"
import type { Rate } from "@/lib/stripe-metrics"
import { isAppStoreConnecting } from "@/lib/app-store-summary"
import type { StripeFeed } from "@/lib/stripe-summary"
import {
  breakdownNote,
  breakdownRows,
  metricsSubscriberRows,
  subscriberTotal,
  type BreakdownRow,
} from "@/lib/subscriber-total"

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
export const HOME_STRIPE_METRIC_IDS: ReadonlySet<MetricId> = new Set(["mrr", "churn", "trials", "subscribers"])

/**
 * Every Metrics card Stripe feeds: Home's four, plus Hill's provisional
 * fields (ARR, Revenue, ARPU, LTV, NRR, Trials per day). Home's ARR KPI
 * stays Not connected for now (Home unchanged, pending Simmons).
 */
export const STRIPE_METRIC_IDS: ReadonlySet<MetricId> = new Set([
  ...HOME_STRIPE_METRIC_IDS,
  "arr",
  "revenue",
  "arpu",
  "ltv",
  "nrr",
  "trials_per_day",
])

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
  /** A daily chart (Trials per day): the YYYY-MM-DD day of each point, instead of six 28-day windows. */
  days?: string[]
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
 * - `entries` — Expenses only: the figure is the sum of the rows the founder
 *   typed into the Expenses tab in this browser — never the seed rows or the
 *   fixture baseline. `value` is null until one is entered.
 */
export type LiveState =
  | { kind: "entries"; value: number | null; previous: number | null; series: (number | null)[] }
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
  arpu: "No active paying subscribers",
  ltv: "Needs ARPU and a churn rate above 0",
  nrr: "No paying subscribers at the start of the window",
}

/** A card whose field this Stripe sync does not send yet (Hill's provisional fields). */
export const NOT_IN_SYNC_TEXT = "Not in Stripe\u2019s figures yet"

/** The Stripe cards with a figure from this sync, in board order: the core four, then each provisional field sent. */
export function stripeLiveLabels(m: Extract<StripeFeed, { kind: "live" }>["metrics"]): string[] {
  const extras: [keyof typeof m, string][] = [
    ["arr", "ARR"],
    ["revenue", "Revenue"],
    ["trialsStartedPerDay", "Trials per day"],
    ["arpu", "ARPU"],
    ["ltv", "LTV"],
    ["nrr", "NRR"],
  ]
  return ["MRR", "Churn Rate", "Trial Conversions", "Subscribers", ...extras.filter(([k]) => m[k] !== undefined).map(([, l]) => l)]
}

/** "A, B and C". */
export function listOf(items: readonly string[]) {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

/** Under Trials per day's headline. */
export const TRIALS_PER_DAY_NOTE = "Trials started in the last 28 days"
/** Under Revenue's headline. */
export const revenueNote = (invoices: number) => `${count(invoices)} paid ${invoices === 1 ? "invoice" : "invoices"} · gross, before refunds`
/** Under the Metrics Subscribers headline. */
export const ACTIVE_PAYING_NOTE = "Active paying coaches"

type Figure = Pick<LiveMetric, "value" | "previous" | "series"> & Partial<Pick<LiveMetric, "note" | "days" | "breakdown">>

/** Hill's fields, as a card's figure; null when this sync does not send it. */
function extraFigure(id: MetricId, m: Extract<StripeFeed, { kind: "live" }>["metrics"]): Figure | null {
  switch (id) {
    case "arr":
      return m.arr ? { value: m.arr.value, previous: m.arr.previous, series: m.arr.series } : null
    case "revenue":
      return m.revenue
        ? { value: m.revenue.value, previous: m.revenue.previous, series: m.revenue.series, note: revenueNote(m.revenue.invoices) }
        : null
    case "arpu":
    case "ltv": {
      const f = m[id]
      // No history: no chart, just the headline and its change.
      return f ? { value: f.value, previous: f.previous, series: [] } : null
    }
    case "nrr":
      return m.nrr
        ? { value: m.nrr.value, previous: m.nrr.previous, series: m.nrr.series, note: m.nrr.basis === "current_prices" ? NRR_NOTE : undefined }
        : null
    case "trials_per_day": {
      const t = m.trialsStartedPerDay
      return t
        ? {
            value: t.total,
            // Nothing started in the window before: no comparison, rather than "+∞%".
            previous: t.previousTotal === 0 ? null : t.previousTotal,
            series: t.series.map((d) => d.count),
            days: t.series.map((d) => d.date),
            note: TRIALS_PER_DAY_NOTE,
          }
        : null
    }
    default:
      return null
  }
}

/**
 * Metrics › Subscribers (pending Simmons; Home keeps the Oct 14 total):
 * the headline is active paying coaches only — Stripe's paying count,
 * which Hill's split makes `active` only — with Past due (amber), App
 * Store and Free on their own lines, none of them added in. A server
 * without the split still counts past due in the headline: the fine
 * print says so. The headline does not wait for the App Store (it is
 * not in it); its line says Connecting… meanwhile.
 */
export function metricsSubscribers(feed: Extract<StripeFeed, { kind: "live" }>, timeZone: string): LiveMetric {
  const m = feed.metrics
  const { rows, note } = metricsSubscriberRows(m, feed.appStore, timeZone)
  return {
    source: "stripe",
    value: m.subscribers.value,
    previous: m.subscribers.previous,
    series: m.subscribers.series,
    updated: feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null,
    empty: null,
    note: ACTIVE_PAYING_NOTE,
    breakdown: { rows, note },
  }
}

/** What the Metrics card `id` shows for this feed. */
export function liveMetric(id: MetricId, feed: StripeFeed, timeZone: string): LiveState {
  if (!STRIPE_METRIC_IDS.has(id)) return notConnected(sourceFor(id))
  if (feed.kind === "not_connected") return notConnected("stripe")
  if (feed.kind === "loading") return feed.connecting ? { kind: "loading", connecting: true } : { kind: "loading" }
  if (id === "subscribers" && isAppStoreConnecting(feed.appStore)) return { kind: "loading", connecting: true }
  const m = feed.metrics
  if (!HOME_STRIPE_METRIC_IDS.has(id)) {
    const figure = extraFigure(id, m)
    const updated = feed.stale ? lastUpdatedLabel(feed.lastSyncedAt, timeZone) : null
    // Not sent yet: an em dash and why; no "Last updated" (there is no figure to date).
    if (!figure) return { kind: "live", metric: { source: "stripe", value: null, previous: null, series: [], updated: null, empty: NOT_IN_SYNC_TEXT } }
    return {
      kind: "live",
      metric: {
        source: "stripe",
        ...figure,
        updated,
        empty: figure.value === null ? (EMPTY[id] ?? "No data yet") : null,
      },
    }
  }
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

/** The Expenses card's line before the founder has entered a row. */
export const NO_EXPENSES_TEXT = "No expenses entered yet. Rows you add on the Expenses tab count here."
/** The Expenses card with entries this window but none in the one before. */
export const NO_PRIOR_EXPENSES_TEXT = "No expenses entered for the previous 28 days"

/** How many 28-day windows a card's chart shows (oldest first). */
const WINDOWS = 6

/**
 * The Expenses card from the rows the founder entered: six 28-day windows
 * ending `today`, oldest first. Seed rows (`SEED_EXPENSE_IDS`) and the
 * fixture baseline never count, so with nothing entered there is no figure.
 */
export function ownExpenses(expenses: readonly Expense[], today: IsoDay | Date): LiveState {
  const own = expenses.filter((e) => !SEED_EXPENSE_IDS.has(e.id))
  if (own.length === 0) return { kind: "entries", value: null, previous: null, series: [] }
  const series: number[] = []
  let period = periodEnding(today)
  for (let i = 0; i < WINDOWS; i++) {
    series.unshift(expensesTotal(own, period))
    period = periodBefore(period)
  }
  // Nothing entered in the window before: no comparison, rather than "+0.0%".
  const previous = series[WINDOWS - 2] === 0 ? null : series[WINDOWS - 2]
  return { kind: "entries", value: series[WINDOWS - 1], previous, series }
}

/** What Metrics card `id` shows: PostHog's figure for its cards, Stripe's for Stripe's, the founder's entries for Expenses, Not connected otherwise. */
export function liveCard(
  id: MetricId,
  stripe: StripeFeed,
  posthog: PosthogFeed,
  timeZone: string,
  entries: { expenses: readonly Expense[]; today: IsoDay | Date }
): LiveState {
  if (id === "expenses") return ownExpenses(entries.expenses, entries.today)
  if (id === "subscribers") {
    if (stripe.kind !== "live") return liveMetric(id, stripe, timeZone)
    return { kind: "live", metric: metricsSubscribers(stripe, timeZone) }
  }
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
/** #77 prices both ends of a window at today\u2019s prices (`nrr.basis`). */
export const NRR_NOTE = "At current prices"

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
    const isMetric = HOME_STRIPE_METRIC_IDS.has(kpi.id as MetricId)
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
