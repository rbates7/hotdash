import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_STORE_CONNECTED, APP_STORE_CONNECTING, APP_STORE_OFF, LIVE_METRICS, connectingSummary, liveSummary } from "@/test/stripe-fixture"
import {
  CONNECTING_POLL_MS,
  LOADING_VIEW,
  SUMMARY_POLL_MS,
  createSummaryStore,
  summaryReducer,
  type SummaryFetcher,
} from "@/hooks/use-stripe-summary"
import { appStoreHealth, isAppStoreConnecting, parseAppStoreSummary } from "@/lib/app-store-summary"
import { kpis } from "@/lib/home-kpis"
import { metricShell } from "@/lib/kpis"
import { liveKpis, liveMetric } from "@/lib/live-metrics"
import { CONNECTING, NOT_CONNECTED, feedOf, parseStripeSummary, type StripeFeed } from "@/lib/stripe-summary"
import { APP_STORE_CONNECTING_TEXT, EXCLUDES_APP_STORE_CONNECTING, breakdownNote, breakdownRows, subscriberTotal } from "@/lib/subscriber-total"

/**
 * "Connecting": the server has a key (or database URL) and its first read
 * is still running — a fresh server just after a deploy. Screens show a
 * placeholder, never the sample figures as if they were live; with no key
 * at all it is still the honest "Not connected".
 */

const TZ = "America/Chicago"

describe("wire format", () => {
  it("parses a connecting summary, with or without its App Store field", () => {
    expect(parseStripeSummary({ status: "connecting", lastSyncedAt: null, metrics: null })).toEqual(CONNECTING)
    expect(parseStripeSummary(connectingSummary())).toEqual(connectingSummary())
    expect(parseStripeSummary(connectingSummary(APP_STORE_OFF))).toEqual(connectingSummary(APP_STORE_OFF))
  })

  it("parses a connecting App Store reading, and its health word", () => {
    expect(parseAppStoreSummary({ status: "connecting" })).toEqual(APP_STORE_CONNECTING)
    expect(appStoreHealth(APP_STORE_CONNECTING)).toBe("connecting")
    expect(isAppStoreConnecting(APP_STORE_CONNECTING)).toBe(true)
    expect(isAppStoreConnecting(APP_STORE_OFF)).toBe(false)
    expect(isAppStoreConnecting(undefined)).toBe(false)
  })
})

describe("feedOf", () => {
  it("connecting is loading (flagged), not sample", () => {
    expect(feedOf({ phase: "ready", summary: CONNECTING })).toEqual({ kind: "loading", connecting: true })
  })

  it("no key is not_connected, never sample", () => {
    expect(feedOf({ phase: "ready", summary: NOT_CONNECTED })).toEqual({ kind: "not_connected" })
  })

  it("the page's own first load is loading, not connecting", () => {
    expect(feedOf(LOADING_VIEW)).toEqual({ kind: "loading" })
  })
})

describe("Stripe-fed figures while connecting", () => {
  const connecting: StripeFeed = { kind: "loading", connecting: true }

  it("every Stripe metric is a placeholder, never sample", () => {
    for (const id of ["mrr", "churn", "trials", "subscribers"] as const) {
      expect(liveMetric(id, connecting, TZ)).toEqual({ kind: "loading", connecting: true })
    }
  })

  it("Home's Subscribers and Cash this week cards are placeholders", () => {
    const cards = liveKpis(kpis(), connecting, metricShell, TZ)
    for (const card of cards) {
      expect(card).toMatchObject({ source: "loading", value: "–", delta: "" })
    }
  })
})

describe("Stripe live, App Store still connecting", () => {
  const feed = feedOf({ phase: "ready", summary: liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING) })

  it("the Subscribers total waits (a placeholder), never landing without its App Store group", () => {
    // Marked connecting: the card says Connecting… while App Store payers are read.
    expect(liveMetric("subscribers", feed, TZ)).toEqual({ kind: "loading", connecting: true })
    const sub = liveKpis(kpis(), feed, metricShell, TZ).find((k) => k.id === "subscribers")
    expect(sub).toMatchObject({ source: "loading", value: "–" })
  })

  it("the other Stripe figures are live straight away", () => {
    expect(liveMetric("mrr", feed, TZ).kind).toBe("live")
    const cash = liveKpis(kpis(), feed, metricShell, TZ).find((k) => k.id === "cash-this-week")
    expect(cash).toMatchObject({ source: "stripe", value: "$4,322" })
  })

  it("its breakdown row says Connecting…, never 0 or Not connected", () => {
    const total = subscriberTotal(LIVE_METRICS, APP_STORE_CONNECTING)
    expect(total.appStore).toBeNull()
    expect(breakdownRows(total).find((r) => r.key === "appStore")?.value).toBe(APP_STORE_CONNECTING_TEXT)
    expect(breakdownNote(total, TZ)).toBe(EXCLUDES_APP_STORE_CONNECTING)
  })

  it("once it connects, the total includes it", () => {
    const live = feedOf({ phase: "ready", summary: liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTED) })
    const state = liveMetric("subscribers", live, TZ)
    expect(state.kind === "live" && state.metric.value).toBe(1_306)
  })
})

describe("the browser's store while connecting", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("asks again every 5 s while connecting, then every minute once figures land", async () => {
    let answer = connectingSummary()
    const fetcher = vi.fn<SummaryFetcher>(async () => answer)
    const store = createSummaryStore(TZ, { fetcher })
    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: connectingSummary() })
    expect(fetcher).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)

    answer = liveSummary()
    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(store.getState()).toEqual({ phase: "ready", summary: liveSummary() })

    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS - CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(4)
    stop()
  })

  it("an App Store still connecting behind live Stripe also polls sooner", async () => {
    const fetcher = vi.fn<SummaryFetcher>(async () => liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING))
    const store = createSummaryStore(TZ, { fetcher })
    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
  })

  it("our endpoint failing while figures show: stale, and a connecting App Store becomes not connected", () => {
    const view = summaryReducer(
      { phase: "ready", summary: liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING) },
      { type: "failure" }
    )
    expect(view).toEqual({ phase: "ready", summary: liveSummary("stale", LIVE_METRICS, APP_STORE_OFF) })
    // An App Store that had answered keeps its count.
    expect(summaryReducer({ phase: "ready", summary: liveSummary("connected") }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: liveSummary("stale"),
    })
  })

  it("our own endpoint failing while connecting reads as not connected, not connecting forever", () => {
    expect(summaryReducer({ phase: "ready", summary: CONNECTING }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: NOT_CONNECTED,
    })
  })
})
