import type { PosthogMetrics } from "@/lib/posthog-metrics"

/**
 * What `/api/posthog/summary` returns, shared by the route and the browser.
 * No key, no project id, no error text: only computed figures and when
 * they were synced. Same three states as Stripe (`@/lib/stripe-summary`):
 *
 * - `connected`     — the last sync succeeded within the cache window.
 * - `stale`         — PostHog could not be read (down, key revoked or
 *                     removed); the last good figures, as of `lastSyncedAt`.
 * - `not_connected` — no key or project id, or PostHog has never answered.
 */
export type PosthogStatus = "connected" | "stale" | "not_connected"

export type PosthogSummary =
  | { status: "connected" | "stale"; lastSyncedAt: string; metrics: PosthogMetrics }
  | { status: "not_connected"; lastSyncedAt: null; metrics: null }

export const POSTHOG_NOT_CONNECTED: PosthogSummary = { status: "not_connected", lastSyncedAt: null, metrics: null }

/** `/api/health/posthog`: a status word, nothing else. */
export type PosthogHealth = "ok" | "unavailable" | "not_configured"

export const POSTHOG_SUMMARY_PATH = "/api/posthog/summary"
export const POSTHOG_HEALTH_PATH = "/api/health/posthog"

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0
const isRate = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v))
const isCountOrNull = (v: unknown) => v === null || isCount(v)
const isList = (v: unknown, each: (x: unknown) => boolean) => Array.isArray(v) && v.every(each)

/**
 * A response body read back defensively: anything that is not a complete
 * summary is null, and the caller treats it like an unreachable endpoint.
 */
export function parsePosthogSummary(value: unknown): PosthogSummary | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (v.status === "not_connected") return POSTHOG_NOT_CONNECTED
  if (v.status !== "connected" && v.status !== "stale") return null
  if (typeof v.lastSyncedAt !== "string" || !Number.isFinite(Date.parse(v.lastSyncedAt))) return null
  const m = v.metrics as Record<string, Record<string, unknown> | string | null> | null
  if (!m || typeof m !== "object") return null
  const a = m.activeUsers as Record<string, unknown> | undefined
  const r = m.retention as Record<string, unknown> | undefined
  const ok =
    a && typeof a === "object" &&
    isCountOrNull(a.value) && isCountOrNull(a.previous) && isList(a.series, isCountOrNull) &&
    isCount(a.day) && isCount(a.week) &&
    r && typeof r === "object" &&
    isRate(r.value) && isRate(r.previous) && isList(r.series, isRate) &&
    isCountOrNull(r.retained) && isCountOrNull(r.base) &&
    (m.since === null || (typeof m.since === "string" && Number.isFinite(Date.parse(m.since))))
  if (!ok) return null
  return { status: v.status, lastSyncedAt: v.lastSyncedAt, metrics: m as unknown as PosthogMetrics }
}

/* ---------------------------------------------------------- in the browser */

/** The browser's copy: loading until `/api/posthog/summary` first answers. */
export type PosthogView = { phase: "loading" } | { phase: "ready"; summary: PosthogSummary }

/**
 * What a PostHog-backed number shows — `loading` (a placeholder), `sample`
 * (not connected: the sample figure, labelled) or `live` (PostHog's
 * figure; `stale` adds "Last updated …").
 */
export type PosthogFeed =
  | { kind: "loading" }
  | { kind: "sample" }
  | { kind: "live"; stale: boolean; lastSyncedAt: Date; metrics: PosthogMetrics }

export function posthogFeedOf(view: PosthogView): PosthogFeed {
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
