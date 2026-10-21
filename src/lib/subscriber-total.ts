import {
  APP_STORE_SUSPECT_LABEL,
  APP_STORE_SUSPECT_NOTE,
  APP_STORE_SUSPECT_TEXT,
  isSuspectAppStore,
  type AppStoreSummary,
} from "@/lib/app-store-summary"
import { formatWallClock } from "@/lib/clock"
import type { CountSeries, StripeMetrics } from "@/lib/stripe-metrics"

/**
 * The Subscribers figure (Rashad + Bobbi, Data, final, Oct 14 2026): the
 * Home card, the ticker and Metrics › Subscribers all show this total,
 * never one part of it.
 *
 *   (1) Stripe paying   — `isPaying`: active (not past_due, since Oct 20), has paid.
 *   (2) App Store       — App Store payers with no Stripe/invoice
 *                         subscription, from Chlk's database; only when
 *                         that source has answered with a believable
 *                         count (a 0 is suspect: `isSuspectAppStore`).
 *   (3) Free accounts   — `isFreeAccount`: active in Stripe, never paid.
 *
 * History: (1) and (3) come with their own (`payingAt`, `freeAt`). The App
 * Store source has none — it is one count, now — so it is held at that
 * count at every past point. The total's line then sits at the right
 * level, and its delta and "today" are the change in (1)+(3) alone, rather
 * than a jump the size of the App Store count the day it connected.
 */
export type SubscriberTotal = CountSeries & {
  stripePaying: number
  freeAccounts: number
  /** Null when the App Store source is not connected, or read a suspect 0 (not in the total). */
  appStore: number | null
  /** The App Store reading behind `appStore`, for its row. */
  appStoreSource: AppStoreSummary
}

export function subscriberTotal(metrics: Pick<StripeMetrics, "subscribers" | "freeAccounts">, appStore: AppStoreSummary): SubscriberTotal {
  const paying = metrics.subscribers
  const free = metrics.freeAccounts
  const app = appStore.status === "not_connected" || appStore.status === "connecting" || isSuspectAppStore(appStore) ? null : appStore.count
  const held = app ?? 0
  return {
    value: paying.value + free.value + held,
    previous: paying.previous + free.previous + held,
    today: paying.today + free.today,
    series: paying.series.map((p, i) => p + (free.series[i] ?? 0) + held),
    stripePaying: paying.value,
    freeAccounts: free.value,
    appStore: app,
    appStoreSource: appStore,
  }
}

/* -------------------------------------------------------------- breakdown */

export const BREAKDOWN_LABELS = {
  stripePaying: "Stripe paying",
  appStore: "App Store",
  freeAccounts: "Free (never paid)",
} as const

export const APP_STORE_NOT_CONNECTED_TEXT = "Not connected"
export const APP_STORE_CONNECTING_TEXT = "Connecting\u2026"
/** Said wherever the total is shown without the App Store group. */
export const EXCLUDES_APP_STORE = "Total excludes App Store (not connected)"
/** Screens show the total as loading while App Store connects; this is for anything that does not. */
export const EXCLUDES_APP_STORE_CONNECTING = "Total excludes App Store (still connecting)"

export type BreakdownRow = {
  key: keyof typeof BREAKDOWN_LABELS | "pastDue"
  label: string
  value: string
  /** Set when the figure cannot be trusted: the row shows a warning, and this is its accessible label. */
  warning?: string
  /** Amber figure, no icon: worth a look, not a broken read (Past due). Never a link. */
  tone?: "attention"
}

const GROUPED = new Intl.NumberFormat("en-US")

/** The three rows under the total, in the order the definition numbers them. */
export function breakdownRows(total: SubscriberTotal): BreakdownRow[] {
  return [
    { key: "stripePaying", label: BREAKDOWN_LABELS.stripePaying, value: GROUPED.format(total.stripePaying) },
    isSuspectAppStore(total.appStoreSource)
      ? { key: "appStore", label: BREAKDOWN_LABELS.appStore, value: APP_STORE_SUSPECT_TEXT, warning: APP_STORE_SUSPECT_LABEL }
      : {
          key: "appStore",
          label: BREAKDOWN_LABELS.appStore,
          value:
            total.appStore !== null
              ? GROUPED.format(total.appStore)
              : total.appStoreSource.status === "connecting"
                ? APP_STORE_CONNECTING_TEXT
                : APP_STORE_NOT_CONNECTED_TEXT,
        },
    { key: "freeAccounts", label: BREAKDOWN_LABELS.freeAccounts, value: GROUPED.format(total.freeAccounts) },
  ]
}

/**
 * The fine print under the rows, or null: the total leaves App Store out
 * (not connected, or a suspect 0), or its count is an older one (stale).
 */
export function breakdownNote(total: SubscriberTotal, timeZone: string): string | null {
  const s = total.appStoreSource
  if (s.status === "not_connected") return EXCLUDES_APP_STORE
  if (s.status === "connecting") return EXCLUDES_APP_STORE_CONNECTING
  if (isSuspectAppStore(s)) return APP_STORE_SUSPECT_NOTE
  if (s.status === "stale") return `App Store as of ${formatWallClock(new Date(s.asOf), timeZone)}`
  return null
}

/* ------------------------------------------------- Metrics › Subscribers */

export const PAST_DUE_LABEL = "Past due"
/** The Past due line when this Stripe sync has no split yet. */
export const PAST_DUE_UNSPLIT_NOTE = "Includes past due until Stripe\u2019s figures split them out"

/**
 * The lines under Metrics › Subscribers' active-paying headline (pending
 * Simmons; Home keeps the total): Past due (amber, with its MRR at risk),
 * App Store and Free — each on its own, none added into the headline. The
 * App Store line reads as it does under Home's total (Not connected,
 * Connecting…, a suspect 0). Fine print: the headline still holds past
 * due (no split from this sync), or the App Store figure's caveat.
 */
export function metricsSubscriberRows(
  metrics: Pick<StripeMetrics, "subscribers" | "freeAccounts" | "pastDue">,
  appStore: AppStoreSummary,
  timeZone: string
): { rows: BreakdownRow[]; note: string | null } {
  const total = subscriberTotal(metrics, appStore)
  const [, app, free] = breakdownRows(total)
  const pd = metrics.pastDue
  const pastDue: BreakdownRow = pd
    ? {
        key: "pastDue",
        label: PAST_DUE_LABEL,
        value: pd.mrr > 0 ? `${GROUPED.format(pd.value)} · ${MONEY.format(pd.mrr)} MRR` : GROUPED.format(pd.value),
        ...(pd.value > 0 && { tone: "attention" as const }),
      }
    : { key: "pastDue", label: PAST_DUE_LABEL, value: "\u2014" }
  const s = total.appStoreSource
  // One line: a suspect App Store read matters most, then an older App Store count, then the missing split.
  const note = isSuspectAppStore(s)
    ? APP_STORE_SUSPECT_NOTE
    : s.status === "stale"
      ? `App Store as of ${formatWallClock(new Date(s.asOf), timeZone)}`
      : !pd
        ? PAST_DUE_UNSPLIT_NOTE
        : null
  return { rows: [pastDue, app, free], note }
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

/** Rows and fine print as one sentence, for an accessible description (the ticker's). */
export function breakdownViewText(view: { rows: BreakdownRow[]; note: string | null }) {
  const rows = view.rows.map((r) => `${r.label} ${r.value}${r.warning ? " (warning)" : ""}`).join(", ")
  return `${rows}.${view.note ? ` ${view.note}.` : ""}`
}
