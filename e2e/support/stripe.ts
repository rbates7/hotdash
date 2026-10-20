import type { Page } from "@playwright/test"

import {
  APP_STORE_CONNECTED,
  APP_STORE_OFF,
  APP_STORE_STALE,
  APP_STORE_ZERO,
  APP_STORE_ZERO_STALE,
  LIVE_METRICS,
  liveSummary,
  SYNCED_AT,
} from "../../src/test/stripe-fixture"
import type { MrrCashSummary } from "../../src/lib/stripe-mrr-cash"
import type { StripeMetrics } from "../../src/lib/stripe-metrics"
import type { StripeSummary } from "../../src/lib/stripe-summary"
import type { StripeSubscriberList } from "../../src/lib/stripe-subscribers"

export { APP_STORE_CONNECTED, APP_STORE_OFF, APP_STORE_STALE, APP_STORE_ZERO, APP_STORE_ZERO_STALE, LIVE_METRICS, liveSummary }

/**
 * Answer the browser's `/api/stripe/summary` with `summary` — the server's
 * own route (no key and no database URL in e2e) is never reached, and
 * neither is Stripe or Chlk's database. `liveSummary()` has the App Store
 * connected (1,079 + 53 + 174 = 1,306); pass `APP_STORE_OFF` as its third
 * argument for not connected (1,253, "Total excludes App Store").
 * Pass a function to change the answer mid-test (each poll reads it anew).
 * Returns the time-zone parameters the page asked with.
 */
export async function mockStripe(page: Page, summary: StripeSummary | (() => StripeSummary)) {
  const zones: string[] = []
  await page.route("**/api/stripe/summary**", async (route) => {
    zones.push(new URL(route.request().url()).searchParams.get("tz") ?? "")
    const json = typeof summary === "function" ? summary() : summary
    await route.fulfill({ json, headers: { "Cache-Control": "no-store" } })
  })
  return zones
}

/**
 * Connected (or stale) with a Subscribers total of `count`: the fixture's
 * free accounts and App Store payers, and Stripe paying the rest. Today's
 * net change is `today` (flat by default), all of it on Stripe.
 */
export function withSubscribers(
  count: number,
  status: "connected" | "stale" = "connected",
  today = 0
): StripeSummary {
  const free = LIVE_METRICS.freeAccounts.value
  const app = "count" in APP_STORE_CONNECTED ? APP_STORE_CONNECTED.count : 0
  const metrics: StripeMetrics = {
    ...LIVE_METRICS,
    subscribers: { ...LIVE_METRICS.subscribers, value: count - free - app, today },
    freeAccounts: { ...LIVE_METRICS.freeAccounts, today: 0 },
  }
  return liveSummary(status, metrics, APP_STORE_CONNECTED)
}

/**
 * `/api/stripe/mrr-cash` as connected (or stale), from the Stripe fixture's
 * week (Mon Oct 12 – Sun Oct 18, Central, two days in) and twelve months
 * ending at its MRR, so the last bar equals the MRR card ($61,235) and the
 * cash total equals Cash this week ($4,322 / $3,900). Never real Stripe data.
 */
const FIXTURE_MRR = [44_100, 45_800, 47_200, 48_000, 49_900, 52_000, 54_000, 56_000, 57_500, 58_300, 59_000, 61_234.56]
export function liveMrrCash(status: "connected" | "stale" = "connected"): MrrCashSummary {
  return {
    status,
    lastSyncedAt: SYNCED_AT,
    mrr: {
      points: FIXTURE_MRR.map((value, i) => {
        const m = new Date(Date.UTC(2025, 10 + i, 1))
        return { month: m.toISOString().slice(0, 7), value, partial: i === FIXTURE_MRR.length - 1 }
      }),
    },
    cash: {
      since: LIVE_METRICS.cashThisWeek.since,
      value: LIVE_METRICS.cashThisWeek.value,
      previous: LIVE_METRICS.cashThisWeek.previous,
      days: [
        { date: "2026-10-12", value: 2_000, previous: 1_500 },
        { date: "2026-10-13", value: 2_321.5, previous: 2_400 },
        { date: "2026-10-14", value: null, previous: null },
        { date: "2026-10-15", value: null, previous: null },
        { date: "2026-10-16", value: null, previous: null },
        { date: "2026-10-17", value: null, previous: null },
        { date: "2026-10-18", value: null, previous: null },
      ],
    },
  }
}

/** Answer the browser's `/api/stripe/mrr-cash` with `summary` (the real route is never reached). */
export async function mockMrrCash(page: Page, summary: MrrCashSummary) {
  await page.route("**/api/stripe/mrr-cash**", (route) =>
    route.fulfill({ json: summary, headers: { "Cache-Control": "no-store" } })
  )
}

/**
 * Answer the browser's `/api/stripe/subscribers?list=…` per list: a body,
 * or a bare status (401 for the login gate). The real route is never
 * reached; rows are fictional @example.com coaches only.
 */
export async function mockSubscriberLists(
  page: Page,
  answers: Partial<Record<"new" | "churned", StripeSubscriberList | number>>
) {
  await page.route("**/api/stripe/subscribers**", async (route) => {
    const list = new URL(route.request().url()).searchParams.get("list") as "new" | "churned"
    const answer = answers[list]
    if (answer === undefined) return route.fulfill({ status: 404, json: { error: "not_found" } })
    if (typeof answer === "number") return route.fulfill({ status: answer, json: { error: "Locked. Sign in at /unlock." } })
    await route.fulfill({ json: answer, headers: { "Cache-Control": "no-store" } })
  })
}
