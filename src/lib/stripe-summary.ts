import type { StripeMetrics } from "@/lib/stripe-metrics"

/**
 * What `/api/stripe/summary` returns, shared by the route and the browser.
 * No key, no error text: only computed figures and when they were synced.
 *
 * - `connected`     — the last sync succeeded within the cache window.
 * - `stale`         — Stripe could not be read (down, key revoked or
 *                     removed); these are the last good figures, as of
 *                     `lastSyncedAt`.
 * - `not_connected` — no key, or Stripe has never answered: no figures.
 */
export type StripeStatus = "connected" | "stale" | "not_connected"

export type StripeSummary =
  | { status: "connected" | "stale"; lastSyncedAt: string; metrics: StripeMetrics }
  | { status: "not_connected"; lastSyncedAt: null; metrics: null }

export const NOT_CONNECTED: StripeSummary = { status: "not_connected", lastSyncedAt: null, metrics: null }

/** `/api/health/stripe`: a status word, nothing else. */
export type StripeHealth = "ok" | "unavailable" | "not_configured"

export const STRIPE_SUMMARY_PATH = "/api/stripe/summary"
export const STRIPE_HEALTH_PATH = "/api/health/stripe"

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isRate = (v: unknown) => v === null || isNum(v)
const isNums = (v: unknown, each: (x: unknown) => boolean = isNum) => Array.isArray(v) && v.every(each)

/**
 * A response body read back defensively: anything that is not a complete
 * summary is null, and the caller treats it like an unreachable endpoint.
 */
export function parseStripeSummary(value: unknown): StripeSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return NOT_CONNECTED
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  const m = v.metrics as Record<string, Record<string, unknown>> | null
  if (!m || typeof m !== "object") return null
  const { subscribers: s, cashThisWeek: c, mrr, churn, trialToPaid: t } = m
  const ok =
    s && isNum(s.value) && isNum(s.previous) && isNum(s.today) && isNums(s.series) &&
    c && isNum(c.value) && isNum(c.previous) && typeof c.since === "string" &&
    mrr && isNum(mrr.value) && isNum(mrr.previous) && isNums(mrr.series) &&
    churn && isRate(churn.value) && isRate(churn.previous) && isNums(churn.series, isRate) &&
    isNum(churn.churned) && isNum(churn.base) &&
    t && isRate(t.value) && isRate(t.previous) && isNums(t.series, isRate) &&
    isNum(t.converted) && isNum(t.ended)
  if (!ok) return null
  return { status: v.status, lastSyncedAt: v.lastSyncedAt, metrics: m as unknown as StripeMetrics }
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until `/api/stripe/summary` first answers. */
export type StripeView = { phase: "loading" } | { phase: "ready"; summary: StripeSummary }

/**
 * What a Stripe-backed number shows:
 * - `loading` — a placeholder;
 * - `sample`  — Stripe is not connected: the sample figure, labelled;
 * - `live`    — Stripe's figure, no label; `stale` adds "Last updated …".
 */
export type StripeFeed =
  | { kind: "loading" }
  | { kind: "sample" }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; metrics: StripeMetrics }

export function feedOf(view: StripeView): StripeFeed {
  if (view.phase === "loading") return { kind: "loading" }
  const { summary } = view
  if (summary.status === "not_connected") return { kind: "sample" }
  return {
    kind: "live",
    stale: summary.status === "stale",
    lastSyncedAt: new Date(summary.lastSyncedAt),
    metrics: summary.metrics,
  }
}
