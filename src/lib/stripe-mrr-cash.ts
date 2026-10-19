import { addDays, startOfDay, startOfWeek, todayIn, type IsoDay } from "@/lib/clock"
import { grossChargesCents, mrrAt, type StripeData } from "@/lib/stripe-metrics"
import type { StripeStatus } from "@/lib/stripe-summary"

/**
 * The MRR chart and the Cash this week breakdown, from the same Stripe
 * copy the summary reads (`@/lib/server/stripe`). Pure: the server hands in
 * what it synced and the instant it synced, and gets back the two panels.
 *
 * - **MRR chart**: one point per calendar month in the founder's zone, the
 *   MRR (`mrrAt`, the Metrics card's own definition) at the end of each of
 *   the last `MRR_MONTHS - 1` complete months, and now for this month.
 * - **Cash this week**: gross cash in (`grossChargesCents`) per day from
 *   Monday 00:00, beside the same weekday last week. Today runs to `now`
 *   and is compared with last week's same weekday cut at the same time;
 *   days still ahead are `null`, never zero. The totals match the summary's
 *   `cashThisWeek` exactly.
 */

export const MRR_MONTHS = 12

export type MrrPoint = {
  /** "YYYY-MM" in the founder's zone. */
  month: string
  /** Whole dollars. */
  value: number
  /** True for this month, measured at `now` rather than at its end. */
  partial: boolean
}

export type CashDay = {
  date: IsoDay
  /** Gross dollars in that day; `null` for days still ahead. */
  value: number | null
  /** The same weekday last week, cut at the same time when it is today. */
  previous: number | null
}

export type MrrCash = {
  mrr: { points: MrrPoint[] }
  cash: { since: string; value: number; previous: number; days: CashDay[] }
}

const toSec = (d: Date) => Math.floor(d.getTime() / 1000)

function monthStart(year: number, month: number): IsoDay {
  // `month` may run past 1–12; Date.UTC normalises it.
  const d = new Date(Date.UTC(year, month - 1, 1))
  return d.toISOString().slice(0, 10)
}

/** The last `count` calendar months in `timeZone`, oldest first, with their end instants (this one ends at `now`). */
export function monthsEnding(now: Date, timeZone: string, count = MRR_MONTHS) {
  const [y, m] = todayIn(now, timeZone).split("-").map(Number)
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1)
    const first = monthStart(y, m + offset)
    const isCurrent = offset === 0
    const endSec = isCurrent ? toSec(now) : toSec(startOfDay(monthStart(y, m + offset + 1), timeZone))
    return { month: first.slice(0, 7), endSec, partial: isCurrent }
  })
}

export function mrrChart(data: StripeData, now: Date, timeZone: string, count = MRR_MONTHS): MrrPoint[] {
  return monthsEnding(now, timeZone, count).map(({ month, endSec, partial }) => ({
    month,
    value: mrrAt(data.subscriptions, endSec),
    partial,
  }))
}

export function cashWeek(data: StripeData, now: Date, timeZone: string): MrrCash["cash"] {
  const weekStart = startOfWeek(now, timeZone)
  const monday = todayIn(weekStart, timeZone)
  const today = todayIn(now, timeZone)
  const nowSec = toSec(now)
  const elapsedInDay = now.getTime() - startOfDay(today, timeZone).getTime()
  const sum = (from: Date, toExclusiveSec: number) => grossChargesCents(data.charges, toSec(from), toExclusiveSec) / 100

  const days: CashDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    if (date > today) return { date, value: null, previous: null }
    const start = startOfDay(date, timeZone)
    const lastStart = startOfDay(addDays(date, -7), timeZone)
    if (date === today) {
      return {
        date,
        value: sum(start, nowSec + 1),
        previous: sum(lastStart, toSec(new Date(lastStart.getTime() + elapsedInDay)) + 1),
      }
    }
    return {
      date,
      value: sum(start, toSec(startOfDay(addDays(date, 1), timeZone))),
      previous: sum(lastStart, toSec(startOfDay(addDays(date, -6), timeZone))),
    }
  })

  // The totals are computed the summary's way (one window each), so the
  // two can never disagree by a rounding cent.
  const lastWeekStart = startOfDay(addDays(monday, -7), timeZone)
  const elapsed = now.getTime() - weekStart.getTime()
  return {
    since: weekStart.toISOString(),
    value: sum(weekStart, nowSec + 1),
    previous: sum(lastWeekStart, toSec(new Date(lastWeekStart.getTime() + elapsed)) + 1),
    days,
  }
}

export function computeMrrCash(data: StripeData, { now, timeZone }: { now: Date; timeZone: string }): MrrCash {
  return { mrr: { points: mrrChart(data, now, timeZone) }, cash: cashWeek(data, now, timeZone) }
}

/* -------------------------------------------------------------- response */

/**
 * What `GET /api/stripe/mrr-cash` returns. No key, no error text. Its
 * status is Stripe's own (`StripeStatus`, see `stripe-summary`), decided by
 * the same rule on the server, so the panel and the Stripe cards are
 * connecting, stale or not connected together.
 */
export type MrrCashStatus = StripeStatus

export type LiveMrrCashSummary = { status: Extract<StripeStatus, "connected" | "stale">; lastSyncedAt: string } & MrrCash
export type MrrCashSummary =
  | LiveMrrCashSummary
  | { status: Exclude<StripeStatus, "connected" | "stale">; lastSyncedAt: null }

export function isLiveMrrCash(summary: MrrCashSummary): summary is LiveMrrCashSummary {
  return summary.status === "connected" || summary.status === "stale"
}

export const MRR_CASH_PATH = "/api/stripe/mrr-cash"
export const MRR_CASH_NOT_CONNECTED: MrrCashSummary = { status: "not_connected", lastSyncedAt: null }
export const MRR_CASH_CONNECTING: MrrCashSummary = { status: "connecting", lastSyncedAt: null }

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isNumOrNull = (v: unknown) => v === null || isNum(v)

/** A response body read back defensively: anything incomplete is null. */
export function parseMrrCashSummary(value: unknown): MrrCashSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return MRR_CASH_NOT_CONNECTED
  if (v.status === "connecting") return MRR_CASH_CONNECTING
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  const mrr = v.mrr as { points?: unknown } | undefined
  const cash = v.cash as Record<string, unknown> | undefined
  const pointsOk =
    Array.isArray(mrr?.points) &&
    mrr.points.length > 0 &&
    mrr.points.every(
      (p: Record<string, unknown>) =>
        p && typeof p.month === "string" && /^\d{4}-\d{2}$/.test(p.month) && isNum(p.value) && typeof p.partial === "boolean"
    )
  const cashOk =
    cash &&
    typeof cash.since === "string" &&
    isNum(cash.value) &&
    isNum(cash.previous) &&
    Array.isArray(cash.days) &&
    cash.days.length === 7 &&
    cash.days.every(
      (d: Record<string, unknown>) => d && typeof d.date === "string" && isNumOrNull(d.value) && isNumOrNull(d.previous)
    )
  if (!pointsOk || !cashOk) return null
  return {
    status: v.status,
    lastSyncedAt: v.lastSyncedAt,
    mrr: { points: mrr.points as MrrPoint[] },
    cash: cash as unknown as MrrCash["cash"],
  }
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until the endpoint first answers. */
export type MrrCashView = { phase: "loading" } | { phase: "ready"; summary: MrrCashSummary }

/**
 * What the panel shows. There is no sample state: before figures exist it
 * is a placeholder (`loading`, with `connecting` while Stripe's first sync
 * runs, as in `StripeFeed`) or says so (`not_connected`).
 */
export type MrrCashPanelState =
  | { kind: "loading"; connecting?: boolean }
  | { kind: "not_connected" }
  | ({ kind: "live"; stale: boolean; lastSyncedAt: Date } & MrrCash)

export function panelStateOf(view: MrrCashView): MrrCashPanelState {
  if (view.phase === "loading") return { kind: "loading" }
  const { summary } = view
  if (!isLiveMrrCash(summary)) return summary.status === "connecting" ? { kind: "loading", connecting: true } : { kind: "not_connected" }
  return {
    kind: "live",
    stale: summary.status === "stale",
    lastSyncedAt: new Date(summary.lastSyncedAt),
    mrr: summary.mrr,
    cash: summary.cash,
  }
}

/**
 * A failed read of our own endpoint keeps the last figures, marked stale;
 * with none yet (loading or connecting) it reads as not connected.
 */
export function onFetchFailure(view: MrrCashView): MrrCashView {
  if (view.phase === "ready" && isLiveMrrCash(view.summary)) {
    return { phase: "ready", summary: { ...view.summary, status: "stale" } }
  }
  if (view.phase === "ready" && view.summary.status === "not_connected") return view
  return { phase: "ready", summary: MRR_CASH_NOT_CONNECTED }
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-10" → "Oct"; "Oct 2026" with `withYear`. */
export function monthLabel(month: string, withYear = false) {
  const [y, m] = month.split("-").map(Number)
  const name = MONTH_NAMES[m - 1] ?? month
  return withYear ? `${name} ${y}` : name
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export function weekdayLabel(index: number) {
  return WEEKDAYS[index] ?? ""
}
