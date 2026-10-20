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
  /** Null when the server sent none (read back in the browser). */
  mrr: number | null
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

/* ------------------------------------------------- read back in the browser */

/**
 * The browser reads the route's body defensively: a malformed row is
 * dropped rather than failing the list, a missing name or email reads as
 * null, and only known keys are copied. A 401 means the session expired
 * (the route sits behind the login gate), never "not connected".
 */
export type SubscriberListKind = SubscriberList
export type SubscriberInterval = "month" | "year" | "week" | "day"
export const SUBSCRIBER_LIST_MAX = SUBSCRIBER_LIST_LIMIT

export type StripeSubscriberList = {
  status: "connected" | "stale" | "connecting" | "not_connected"
  lastSyncedAt: string | null
  list: SubscriberListKind
  window: { start: string; end: string } | null
  /** All in the window; `rows` holds at most `SUBSCRIBER_LIST_MAX`. */
  total: number
  rows: StripeSubscriberRow[]
}


export const subscriberListNotConnected = (list: SubscriberListKind): StripeSubscriberList => ({
  status: "not_connected",
  lastSyncedAt: null,
  list,
  window: null,
  total: 0,
  rows: [],
})

const INTERVALS: ReadonlySet<string> = new Set(["month", "year", "week", "day"])
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const isIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v))
const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

function parseRow(v: unknown, list: SubscriberListKind): StripeSubscriberRow | null {
  if (!isObj(v)) return null
  const id = text(v.subscriptionId)
  if (!id || !isIso(v.at)) return null
  return {
    subscriptionId: id,
    customerName: text(v.customerName),
    customerEmail: text(v.customerEmail),
    plan: text(v.plan),
    interval: typeof v.interval === "string" && INTERVALS.has(v.interval) ? (v.interval as SubscriberInterval) : null,
    mrr: typeof v.mrr === "number" && Number.isFinite(v.mrr) ? v.mrr : null,
    at: v.at,
    reason: list === "churned" ? text(v.reason) : null,
  }
}

/** The list for tab `list`, or null when the body is not one (the caller treats it like an unreachable endpoint). */
export function parseSubscriberList(value: unknown, list: SubscriberListKind): StripeSubscriberList | null {
  if (!isObj(value)) return null
  if (value.list !== undefined && value.list !== list) return null
  const { status } = value
  if (status === "not_connected" || status === "connecting") return { ...subscriberListNotConnected(list), status }
  if (status !== "connected" && status !== "stale") return null
  if (!isIso(value.lastSyncedAt)) return null
  const w = value.window
  const window = isObj(w) && isIso(w.start) && isIso(w.end) ? { start: w.start, end: w.end } : null
  const rows = (Array.isArray(value.rows) ? value.rows : [])
    .map((r) => parseRow(r, list))
    .filter((r): r is StripeSubscriberRow => r !== null)
    // Newest first, as the route sends them (kept if it ever does not).
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, SUBSCRIBER_LIST_MAX)
  const total =
    typeof value.total === "number" && Number.isInteger(value.total) && value.total >= rows.length ? value.total : rows.length
  return { status, lastSyncedAt: value.lastSyncedAt, list, window, total, rows }
}

/* ---------------------------------------------------------- in the browser */

export type SubscriberListView =
  | { phase: "loading" }
  | { phase: "ready"; list: StripeSubscriberList }
  | { phase: "unauthorized" }

export type SubscriberListFetch =
  | { kind: "ok"; data: StripeSubscriberList }
  | { kind: "unauthorized" }
  | { kind: "error" }

/**
 * - ok → that list;
 * - 401 → the session expired (polling stops; signing in reloads the page);
 * - anything else failing keeps the last rows as stale, or with none (or
 *   while connecting, no longer known to be on its way) is not connected.
 */
export function subscriberListReducer(view: SubscriberListView, result: SubscriberListFetch, list: SubscriberListKind): SubscriberListView {
  if (result.kind === "ok") return { phase: "ready", list: result.data }
  if (result.kind === "unauthorized") return { phase: "unauthorized" }
  if (view.phase === "ready" && (view.list.status === "connected" || view.list.status === "stale")) {
    return { phase: "ready", list: { ...view.list, status: "stale" } }
  }
  return { phase: "ready", list: subscriberListNotConnected(list) }
}

/** What a list tab shows. */
export type SubscriberListState =
  | { kind: "not_connected" }
  | { kind: "loading"; connecting?: boolean }
  | { kind: "session_expired" }
  | {
      kind: "live"
      rows: StripeSubscriberRow[]
      total: number
      window: { start: string; end: string } | null
      stale: boolean
      lastSyncedAt: Date
    }

export function subscriberListState(view: SubscriberListView): SubscriberListState {
  if (view.phase === "loading") return { kind: "loading" }
  if (view.phase === "unauthorized") return { kind: "session_expired" }
  const l = view.list
  if (l.status === "not_connected") return { kind: "not_connected" }
  if (l.status === "connecting") return { kind: "loading", connecting: true }
  return {
    kind: "live",
    rows: l.rows,
    total: l.total,
    window: l.window,
    stale: l.status === "stale",
    lastSyncedAt: new Date(l.lastSyncedAt!),
  }
}

/* ------------------------------------------------------------ how it reads */

const INTERVAL_WORD: Record<string, string> = { month: "Monthly", year: "Annual", week: "Weekly", day: "Daily" }

/** "Coach Pro · Annual", "Annual", or an em dash. */
export function planText(row: Pick<StripeSubscriberRow, "plan" | "interval">) {
  const parts = [row.plan, row.interval ? (INTERVAL_WORD[row.interval] ?? null) : null].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "\u2014"
}

/** The row's title and its second line: the name over the email, the email alone, or an em dash. */
export function whoText(row: Pick<StripeSubscriberRow, "customerName" | "customerEmail">): { title: string; email: string | null } {
  if (row.customerName) return { title: row.customerName, email: row.customerEmail }
  return { title: row.customerEmail ?? "\u2014", email: null }
}

const REASONS: Record<string, string> = {
  cancellation_requested: "Canceled by customer",
  payment_failed: "Payment failed",
  payment_disputed: "Payment disputed",
}

/** Stripe's cancellation reason in words; an em dash when there is none. */
export function reasonText(reason: string | null) {
  if (!reason) return "\u2014"
  const known = REASONS[reason]
  if (known) return known
  const words = reason.replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
