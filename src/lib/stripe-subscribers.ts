import {
  activeAt,
  isCounted,
  subscriptionMrrCents,
  windowsAt,
  type StripeSubscription,
} from "@/lib/stripe-metrics"
import type { StripeStatus } from "@/lib/stripe-summary"

/**
 * The New and Churned Subscribers lists behind `GET /api/stripe/subscribers`,
 * for the current 28-day window (the one the Metrics cards end on).
 *
 * - `new`     — Stripe subscriptions whose first paid invoice landed in the
 *               window (`active` now, or since canceled): the joiners in
 *               `subscribers`.
 * - `churned` — the window's churn set (`churnFor`): active at its start
 *               and ended since, so `total` equals `metrics.churn.churned`.
 *
 * Names and emails are looked up from Stripe customers on the server, per
 * request (cached briefly); they are never logged or kept in the sync.
 */
export const SUBSCRIBER_LISTS = ["new", "churned"] as const
export type SubscriberList = (typeof SUBSCRIBER_LISTS)[number]
export const STRIPE_SUBSCRIBERS_PATH = "/api/stripe/subscribers"
/** Rows returned at most; `total` is always the full count. */
export const SUBSCRIBER_LIST_LIMIT = 100

export type StripeSubscriberRow = {
  subscriptionId: string
  customerName: string | null
  customerEmail: string | null
  /** The first item's price nickname, if it has one. */
  plan: string | null
  interval: string | null
  /** Monthly-equivalent revenue in dollars: when it started paying (new) or just before it ended (churned). */
  mrr: number
  /** ISO: first paid (new) or ended (churned). */
  at: string
  /** Churned only: Stripe's `cancellation_details.reason`. */
  reason: string | null
}

export type StripeSubscriberListResponse =
  | {
      status: "connected" | "stale"
      lastSyncedAt: string
      list: SubscriberList
      window: { start: string; end: string }
      total: number
      rows: StripeSubscriberRow[]
    }
  | {
      status: Extract<StripeStatus, "connecting" | "not_connected">
      lastSyncedAt: null
      list: SubscriberList
      window: null
      total: 0
      rows: []
    }

export function isSubscriberList(v: unknown): v is SubscriberList {
  return typeof v === "string" && (SUBSCRIBER_LISTS as readonly string[]).includes(v)
}

export function emptySubscriberList(
  list: SubscriberList,
  status: "connecting" | "not_connected" = "not_connected"
): StripeSubscriberListResponse {
  return { status, lastSyncedAt: null, list, window: null, total: 0, rows: [] }
}

/** A row before the customer lookup: the customer id stays on the server. */
export type SubscriberPick = Omit<StripeSubscriberRow, "customerName" | "customerEmail"> & { customerId: string | null }

const iso = (sec: number) => new Date(sec * 1000).toISOString()

/** Pick and order a list from the synced subscriptions, as of `now`. */
export function pickSubscribers(
  subs: readonly StripeSubscription[],
  list: SubscriberList,
  { now, timeZone }: { now: Date; timeZone: string }
): { window: { start: string; end: string }; total: number; picks: SubscriberPick[] } {
  const windows = windowsAt(now, timeZone)
  const w = windows[windows.length - 1]
  const chosen =
    list === "new"
      ? subs.filter(
          (s) =>
            s.first_paid_at != null &&
            (isCounted(s) || s.status === "canceled") &&
            s.first_paid_at >= w.startSec &&
            s.first_paid_at <= w.endSec
        )
      : subs.filter((s) => activeAt(s, w.startSec) && s.ended_at !== null && s.ended_at <= w.endSec)
  const atOf = (s: StripeSubscription) => (list === "new" ? s.first_paid_at! : s.ended_at!)
  const picks = [...chosen]
    .sort((a, b) => atOf(b) - atOf(a))
    .slice(0, SUBSCRIBER_LIST_LIMIT)
    .map((s): SubscriberPick => {
      const at = atOf(s)
      const price = s.items.data[0]?.price
      return {
        subscriptionId: s.id,
        customerId: s.customer ?? null,
        plan: price?.nickname ?? null,
        interval: price?.recurring?.interval ?? null,
        mrr: Math.round(subscriptionMrrCents(s, list === "new" ? at : at - 1)) / 100,
        at: iso(at),
        reason: list === "churned" ? (s.cancellation_details?.reason ?? null) : null,
      }
    })
  return { window: { start: iso(w.startSec), end: iso(w.endSec) }, total: chosen.length, picks }
}
