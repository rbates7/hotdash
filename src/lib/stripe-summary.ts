import { APP_STORE_NOT_CONNECTED, parseAppStoreSummary, type AppStoreSummary } from "@/lib/app-store-summary"
import type { StripeMetricExtras, StripeMetrics } from "@/lib/stripe-metrics"

/**
 * What `/api/stripe/summary` returns, shared by the route and the browser.
 * No key, no error text: only computed figures and when they were synced.
 *
 * - `connected`     — the last sync succeeded within the cache window.
 * - `stale`         — Stripe could not be read (down, key revoked or
 *                     removed); these are the last good figures, as of
 *                     `lastSyncedAt`.
 * - `connecting`    — a key is set and the first sync is still running (a
 *                     fresh server, just after a deploy): no figures yet,
 *                     and never sample ones in their place.
 * - `not_connected` — no key, or Stripe has never answered: no figures.
 *
 * `appStore` is a separate source (Chlk's database, not Stripe) with its
 * own status; the route always sets it, the Stripe service never does.
 */
export type StripeStatus = "connected" | "stale" | "connecting" | "not_connected"

export type StripeSummary = (
  | { status: "connected" | "stale"; lastSyncedAt: string; metrics: StripeMetrics }
  | { status: "connecting" | "not_connected"; lastSyncedAt: null; metrics: null }
) & { appStore?: AppStoreSummary }

export const NOT_CONNECTED: StripeSummary = { status: "not_connected", lastSyncedAt: null, metrics: null }
export const CONNECTING: StripeSummary = { status: "connecting", lastSyncedAt: null, metrics: null }

/** `/api/health/stripe`: a status word, nothing else. */
export type StripeHealth = "ok" | "connecting" | "unavailable" | "not_configured"

export const STRIPE_SUMMARY_PATH = "/api/stripe/summary"
export const STRIPE_HEALTH_PATH = "/api/health/stripe"

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isRate = (v: unknown) => v === null || isNum(v)
const isNums = (v: unknown, each: (x: unknown) => boolean = isNum) => Array.isArray(v) && v.every(each)
const isCounts = (v: Record<string, unknown> | undefined) =>
  Boolean(v) && isNum(v!.value) && isNum(v!.previous) && isNum(v!.today) && isNums(v!.series)

/** The `appStore` field, kept only when it reads cleanly (a bad one is left off: not connected). */
function withAppStore<T extends StripeSummary>(summary: T, raw: unknown): T {
  const appStore = parseAppStoreSummary(raw)
  return appStore ? { ...summary, appStore } : summary
}

const isMaybe = (v: unknown) => v === null || isNum(v)

/** The Oct 20 figures: pastDue, arr, revenue, arpu, ltv, nrr, trialsStartedPerDay. */
function hasNewFigures(m: Record<string, Record<string, unknown>>) {
  const { pastDue: pd, arr, revenue: r, arpu, ltv, nrr, trialsStartedPerDay: tr } = m
  return Boolean(
    pd && isNum(pd.value) && isNum(pd.mrr) &&
    arr && isNum(arr.value) && isNum(arr.previous) && isNums(arr.series) &&
    r && isNum(r.value) && isNum(r.previous) && isNums(r.series) && isNum(r.invoices) &&
    arpu && isMaybe(arpu.value) && isMaybe(arpu.previous) &&
    ltv && isMaybe(ltv.value) && isMaybe(ltv.previous) &&
    nrr && isRate(nrr.value) && isRate(nrr.previous) && isNums(nrr.series, isRate) && nrr.basis === "current_prices" &&
    tr && isNum(tr.total) && isNum(tr.previousTotal) &&
    isNums(tr.series, (d) => {
      const x = d as Record<string, unknown> | null
      return Boolean(x) && typeof x!.date === "string" && isNum(x!.count)
    })
  )
}

/**
 * A response body read back defensively: anything that is not a complete
 * summary is null, and the caller treats it like an unreachable endpoint.
 */
export function parseStripeSummary(value: unknown): StripeSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return withAppStore(NOT_CONNECTED, v.appStore)
  if (v.status === "connecting") return withAppStore(CONNECTING, v.appStore)
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  const m = v.metrics as Record<string, Record<string, unknown>> | null
  if (!m || typeof m !== "object") return null
  const { subscribers: s, freeAccounts: f, cashThisWeek: c, mrr, churn, trialToPaid: t } = m
  const ok =
    isCounts(s) && isCounts(f) &&
    c && isNum(c.value) && isNum(c.previous) && typeof c.since === "string" &&
    mrr && isNum(mrr.value) && isNum(mrr.previous) && isNums(mrr.series) &&
    churn && isRate(churn.value) && isRate(churn.previous) && isNums(churn.series, isRate) &&
    isNum(churn.churned) && isNum(churn.base) &&
    t && isRate(t.value) && isRate(t.previous) && isNums(t.series, isRate) &&
    isNum(t.converted) && isNum(t.ended) &&
    hasNewFigures(m)
  if (!ok) return null
  const core = {
    subscribers: s, freeAccounts: f, cashThisWeek: c, mrr, churn, trialToPaid: t,
  } as unknown as StripeMetrics
  return withAppStore({ status: v.status, lastSyncedAt: v.lastSyncedAt, metrics: { ...core, ...parseExtras(m) } }, v.appStore)
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)
const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
const isCount = (v: unknown) => isNum(v) && Number.isInteger(v) && v >= 0

/**
 * Hill's optional fields, each kept only when it reads cleanly: a missing
 * or malformed one is left off (its card shows an em dash) and never
 * rejects the summary, so Stripe's core figures still show. Only the
 * known keys are copied, so nothing else in the body reaches a screen.
 */
export function parseExtras(m: Record<string, unknown>): StripeMetricExtras {
  const out: StripeMetricExtras = {}
  const { pastDue, arr, revenue, arpu, ltv, nrr, trialsStartedPerDay: trials } = m
  if (isObj(pastDue) && isCount(pastDue.value) && isNum(pastDue.mrr)) out.pastDue = { value: pastDue.value as number, mrr: pastDue.mrr }
  if (isObj(arr) && isNum(arr.value) && isNum(arr.previous) && isNums(arr.series)) {
    out.arr = { value: arr.value, previous: arr.previous, series: [...(arr.series as number[])] }
  }
  if (isObj(revenue) && isNum(revenue.value) && isNum(revenue.previous) && isNums(revenue.series) && isCount(revenue.invoices)) {
    out.revenue = { value: revenue.value, previous: revenue.previous, series: [...(revenue.series as number[])], invoices: revenue.invoices as number }
  }
  for (const [key, raw] of [["arpu", arpu], ["ltv", ltv]] as const) {
    if (isObj(raw) && isRate(raw.value) && isRate(raw.previous)) out[key] = { value: raw.value as number | null, previous: raw.previous as number | null }
  }
  if (isObj(nrr) && isRate(nrr.value) && isRate(nrr.previous) && isNums(nrr.series, isRate)) {
    out.nrr = { value: nrr.value as number | null, previous: nrr.previous as number | null, series: [...(nrr.series as (number | null)[])], basis: "current_prices" }
  }
  if (
    isObj(trials) && isCount(trials.total) && isCount(trials.previousTotal) &&
    Array.isArray(trials.series) && trials.series.every((d) => isObj(d) && isDay(d.date) && isCount(d.count))
  ) {
    const series = (trials.series as { date: string; count: number }[]).map(({ date, count }) => ({ date, count }))
    out.trialsStartedPerDay = { series, total: trials.total as number, previousTotal: trials.previousTotal as number }
  }
  return out
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until `/api/stripe/summary` first answers. */
export type StripeView = { phase: "loading" } | { phase: "ready"; summary: StripeSummary }

/**
 * What a Stripe-backed number shows:
 * - `loading` — a placeholder; `connecting` when the server has a key and
 *               its first sync is still running (Settings says so);
 * - `not_connected` — Stripe has no key (or never answered): no figure at
 *               all, never a sample one in its place; the screen says
 *               Not connected;
 * - `live`    — Stripe's figure, no label; `stale` adds "Last updated …".
 */
export type StripeFeed =
  | { kind: "loading"; connecting?: boolean }
  | { kind: "not_connected" }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; metrics: StripeMetrics; appStore: AppStoreSummary }

export function feedOf(view: StripeView): StripeFeed {
  if (view.phase === "loading") return { kind: "loading" }
  const { summary } = view
  if (summary.metrics === null) return summary.status === "connecting" ? { kind: "loading", connecting: true } : { kind: "not_connected" }
  return {
    kind: "live",
    stale: summary.status === "stale",
    lastSyncedAt: new Date(summary.lastSyncedAt),
    metrics: summary.metrics,
    appStore: summary.appStore ?? APP_STORE_NOT_CONNECTED,
  }
}
