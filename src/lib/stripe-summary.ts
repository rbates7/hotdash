import { APP_STORE_NOT_CONNECTED, parseAppStoreSummary, type AppStoreSummary } from "@/lib/app-store-summary"
import type { StripeMetrics } from "@/lib/stripe-metrics"

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
  return withAppStore({ status: v.status, lastSyncedAt: v.lastSyncedAt, metrics: m as unknown as StripeMetrics }, v.appStore)
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
