import type { AppStoreSummary } from "@/lib/app-store-summary"
import { formatWallClock } from "@/lib/clock"
import type { CountSeries, StripeMetrics } from "@/lib/stripe-metrics"

/**
 * The Subscribers figure (Rashad + Bobbi, Data, final, Oct 14 2026): the
 * Home card, the ticker and Metrics › Subscribers all show this total,
 * never one part of it.
 *
 *   (1) Stripe paying   — `isPaying`: active or past_due, has paid.
 *   (2) App Store       — active App Store subscriptions with no Stripe
 *                         one, from Chlk's database; only when that source
 *                         has answered.
 *   (3) Invoice         — active school/district invoice subscriptions
 *                         with no Stripe one, from the same read; only
 *                         when it carries the count.
 *   (4) Free accounts   — `isFreeAccount`: active in Stripe, never paid.
 *
 * No one is in two groups: (2) and (3) leave out anyone with a Stripe
 * subscription, and on prod no user is in both (Oct 14 2026).
 *
 * History: (1) and (4) come with their own (`payingAt`, `freeAt`). The
 * database source has none — it is one reading, now — so (2) and (3) are
 * held at their counts at every past point. The total's line then sits at
 * the right level, and its delta and "today" are the change in (1)+(4)
 * alone, rather than a jump the size of those counts the day they connected.
 */
export type SubscriberTotal = CountSeries & {
  stripePaying: number
  freeAccounts: number
  /** Null when the App Store source is not connected (not in the total). */
  appStore: number | null
  /** Null when not connected, or the reading has no invoice count (not in the total). */
  invoice: number | null
  /** The database reading behind `appStore` and `invoice`, for their rows. */
  appStoreSource: AppStoreSummary
}

export function subscriberTotal(metrics: Pick<StripeMetrics, "subscribers" | "freeAccounts">, appStore: AppStoreSummary): SubscriberTotal {
  const paying = metrics.subscribers
  const free = metrics.freeAccounts
  const app = appStore.status === "not_connected" ? null : appStore.count
  const invoice = appStore.status === "not_connected" ? null : (appStore.invoice ?? null)
  const held = (app ?? 0) + (invoice ?? 0)
  return {
    value: paying.value + free.value + held,
    previous: paying.previous + free.previous + held,
    today: paying.today + free.today,
    series: paying.series.map((p, i) => p + (free.series[i] ?? 0) + held),
    stripePaying: paying.value,
    freeAccounts: free.value,
    appStore: app,
    invoice,
    appStoreSource: appStore,
  }
}

/* -------------------------------------------------------------- breakdown */

export const BREAKDOWN_LABELS = {
  stripePaying: "Stripe paying",
  appStore: "App Store",
  invoice: "Invoice (school/district)",
  freeAccounts: "Free (never paid)",
} as const

export const APP_STORE_NOT_CONNECTED_TEXT = "Not connected"
/** The invoice row when the reading has no invoice count (an older server). */
export const NOT_REPORTED_TEXT = "\u2014"
/** Said wherever the total is shown without the database's groups. */
export const EXCLUDES_APP_STORE = "Total excludes App Store and invoice (not connected)"
/** Said when the database answered without an invoice count. */
export const EXCLUDES_INVOICE = "Total excludes invoice (not reported)"

export type BreakdownRow = { key: keyof typeof BREAKDOWN_LABELS; label: string; value: string }

const GROUPED = new Intl.NumberFormat("en-US")

/** The four rows under the total, in the order the definition numbers them. */
export function breakdownRows(total: SubscriberTotal): BreakdownRow[] {
  return [
    { key: "stripePaying", label: BREAKDOWN_LABELS.stripePaying, value: GROUPED.format(total.stripePaying) },
    {
      key: "appStore",
      label: BREAKDOWN_LABELS.appStore,
      value: total.appStore === null ? APP_STORE_NOT_CONNECTED_TEXT : GROUPED.format(total.appStore),
    },
    {
      key: "invoice",
      label: BREAKDOWN_LABELS.invoice,
      value:
        total.appStoreSource.status === "not_connected"
          ? APP_STORE_NOT_CONNECTED_TEXT
          : total.invoice === null
            ? NOT_REPORTED_TEXT
            : GROUPED.format(total.invoice),
    },
    { key: "freeAccounts", label: BREAKDOWN_LABELS.freeAccounts, value: GROUPED.format(total.freeAccounts) },
  ]
}

/**
 * The fine print under the rows, or null: the total leaves the database's
 * groups out (not connected) or the invoice one (not reported), or their
 * counts are older ones (stale).
 */
export function breakdownNote(total: SubscriberTotal, timeZone: string): string | null {
  const s = total.appStoreSource
  if (s.status === "not_connected") return EXCLUDES_APP_STORE
  const notes: string[] = []
  if (s.status === "stale") {
    const groups = total.invoice === null ? "App Store" : "App Store and invoice"
    notes.push(`${groups} as of ${formatWallClock(new Date(s.asOf), timeZone)}`)
  }
  if (total.invoice === null) notes.push(EXCLUDES_INVOICE)
  return notes.length ? notes.join(". ") : null
}

/** The breakdown as one sentence, for an accessible description. */
export function breakdownText(total: SubscriberTotal, timeZone: string) {
  const rows = breakdownRows(total).map((r) => `${r.label} ${r.value}`).join(", ")
  const note = breakdownNote(total, timeZone)
  return `${rows}.${note ? ` ${note}.` : ""}`
}
