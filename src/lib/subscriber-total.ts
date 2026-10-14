import type { AppStoreSummary } from "@/lib/app-store-summary"
import { formatWallClock } from "@/lib/clock"
import type { CountSeries, StripeMetrics } from "@/lib/stripe-metrics"

/**
 * The Subscribers figure (Rashad + Bobbi, Data, final, Oct 14 2026): the
 * Home card, the ticker and Metrics › Subscribers all show this total,
 * never one part of it.
 *
 *   (1) Stripe paying   — `isPaying`: active or past_due, has paid.
 *   (2) App Store       — App Store payers with no Stripe/invoice
 *                         subscription, from Chlk's database; only when
 *                         that source has answered.
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
  /** Null when the App Store source is not connected (not in the total). */
  appStore: number | null
  /** The App Store reading behind `appStore`, for its row. */
  appStoreSource: AppStoreSummary
}

export function subscriberTotal(metrics: Pick<StripeMetrics, "subscribers" | "freeAccounts">, appStore: AppStoreSummary): SubscriberTotal {
  const paying = metrics.subscribers
  const free = metrics.freeAccounts
  const app = appStore.status === "not_connected" ? null : appStore.count
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
  freeAccounts: "Free (coupon, never paid)",
} as const

export const APP_STORE_NOT_CONNECTED_TEXT = "Not connected"
/** Said wherever the total is shown without the App Store group. */
export const EXCLUDES_APP_STORE = "Total excludes App Store (not connected)"

export type BreakdownRow = { key: keyof typeof BREAKDOWN_LABELS; label: string; value: string }

const GROUPED = new Intl.NumberFormat("en-US")

/** The three rows under the total, in the order the definition numbers them. */
export function breakdownRows(total: SubscriberTotal): BreakdownRow[] {
  return [
    { key: "stripePaying", label: BREAKDOWN_LABELS.stripePaying, value: GROUPED.format(total.stripePaying) },
    {
      key: "appStore",
      label: BREAKDOWN_LABELS.appStore,
      value: total.appStore === null ? APP_STORE_NOT_CONNECTED_TEXT : GROUPED.format(total.appStore),
    },
    { key: "freeAccounts", label: BREAKDOWN_LABELS.freeAccounts, value: GROUPED.format(total.freeAccounts) },
  ]
}

/**
 * The fine print under the rows, or null: the total leaves App Store out
 * (not connected), or its count is an older one (stale).
 */
export function breakdownNote(total: SubscriberTotal, timeZone: string): string | null {
  const s = total.appStoreSource
  if (s.status === "not_connected") return EXCLUDES_APP_STORE
  if (s.status === "stale") return `App Store as of ${formatWallClock(new Date(s.asOf), timeZone)}`
  return null
}

/** The breakdown as one sentence, for an accessible description. */
export function breakdownText(total: SubscriberTotal, timeZone: string) {
  const rows = breakdownRows(total).map((r) => `${r.label} ${r.value}`).join(", ")
  const note = breakdownNote(total, timeZone)
  return `${rows}.${note ? ` ${note}.` : ""}`
}
