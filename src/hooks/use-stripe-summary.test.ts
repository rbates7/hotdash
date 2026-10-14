import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { liveSummary } from "@/test/stripe"
import {
  LOADING_VIEW,
  SUMMARY_POLL_MS,
  createSummaryStore,
  fetchSummary,
  summaryReducer,
  type SummaryFetcher,
} from "@/hooks/use-stripe-summary"
import { RETRY_MS } from "@/lib/subscriber-source"
import { NOT_CONNECTED, feedOf, parseStripeSummary } from "@/lib/stripe-summary"

describe("summaryReducer", () => {
  it("an answer replaces whatever was there", () => {
    expect(summaryReducer(LOADING_VIEW, { type: "summary", summary: liveSummary() })).toEqual({
      phase: "ready",
      summary: liveSummary(),
    })
  })

  it("our endpoint failing keeps the last figures, marked stale", () => {
    const view = summaryReducer({ phase: "ready", summary: liveSummary("connected") }, { type: "failure" })
    expect(view).toEqual({ phase: "ready", summary: liveSummary("stale") })
  })

  it("failing before any figures reads as not connected (sample, labelled), never zeros", () => {
    expect(summaryReducer(LOADING_VIEW, { type: "failure" })).toEqual({ phase: "ready", summary: NOT_CONNECTED })
  })
})

describe("createSummaryStore", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reads on first listener, then every minute; stops when nobody listens", async () => {
    const fetcher = vi.fn<SummaryFetcher>(async () => liveSummary())
    const store = createSummaryStore("America/Chicago", { fetcher })
    expect(store.getState()).toBe(LOADING_VIEW)
    expect(fetcher).not.toHaveBeenCalled()

    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledWith("America/Chicago")
    expect(store.getState()).toEqual({ phase: "ready", summary: liveSummary() })

    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS * 5)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("backs off after failures, and recovers", async () => {
    let fail = true
    const fetcher = vi.fn<SummaryFetcher>(async () => {
      if (fail) throw new Error("offline")
      return liveSummary()
    })
    const store = createSummaryStore("UTC", { fetcher })
    const listener = vi.fn()
    store.subscribe(listener)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: NOT_CONNECTED })
    await vi.advanceTimersByTimeAsync(RETRY_MS[0] - 1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    fail = false
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(store.getState()).toEqual({ phase: "ready", summary: liveSummary() })
  })

  it("only notifies on a real change", async () => {
    const fetcher = vi.fn<SummaryFetcher>(async () => liveSummary())
    const store = createSummaryStore("UTC", { fetcher })
    const listener = vi.fn()
    store.subscribe(listener)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(SUMMARY_POLL_MS * 3)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe("fetchSummary", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("asks for the zone, uncached, and validates the body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(liveSummary("stale"))))
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchSummary("America/New_York")).resolves.toEqual(liveSummary("stale"))
    expect(fetchMock).toHaveBeenCalledWith("/api/stripe/summary?tz=America%2FNew_York", { cache: "no-store" })
  })

  it("rejects an error status or an unreadable body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })))
    await expect(fetchSummary("UTC")).rejects.toThrow()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "connected" }))))
    await expect(fetchSummary("UTC")).rejects.toThrow()
  })
})

describe("parseStripeSummary", () => {
  it("accepts the three statuses", () => {
    expect(parseStripeSummary(liveSummary("connected"))).toEqual(liveSummary("connected"))
    expect(parseStripeSummary(liveSummary("stale"))).toEqual(liveSummary("stale"))
    expect(parseStripeSummary({ status: "not_connected", lastSyncedAt: null, metrics: null })).toEqual(NOT_CONNECTED)
  })

  it("rejects anything partial or malformed", () => {
    const good = liveSummary()
    expect(parseStripeSummary(null)).toBeNull()
    expect(parseStripeSummary({ status: "ok" })).toBeNull()
    expect(parseStripeSummary({ ...good, lastSyncedAt: "yesterday" })).toBeNull()
    expect(parseStripeSummary({ ...good, metrics: { ...good.metrics, mrr: { value: "61k" } } })).toBeNull()
    expect(
      parseStripeSummary({ ...good, metrics: { ...good.metrics, subscribers: { ...good.metrics!.subscribers, value: null } } })
    ).toBeNull()
    const { freeAccounts: _free, ...noFree } = good.metrics!
    void _free
    expect(parseStripeSummary({ ...good, metrics: noFree })).toBeNull()
  })

  it("reads the App Store field on its own: a bad or missing one is left off, never the Stripe figures", () => {
    const good = liveSummary()
    for (const appStore of [undefined, { status: "connected", count: "53" }, { status: "connected", count: -1, asOf: good.lastSyncedAt }, { status: "up" }]) {
      const parsed = parseStripeSummary({ ...good, appStore })
      expect(parsed?.metrics).toEqual(good.metrics)
      expect(parsed?.appStore).toBeUndefined()
    }
    expect(parseStripeSummary({ ...NOT_CONNECTED, appStore: { status: "not_connected" } })).toEqual({
      ...NOT_CONNECTED,
      appStore: { status: "not_connected" },
    })
  })

  it("reads the invoice count with the App Store's; an older payload without it keeps the App Store count", () => {
    const good = liveSummary()
    expect(parseStripeSummary(good)?.appStore).toEqual({ status: "connected", count: 53, invoice: 83, asOf: good.lastSyncedAt })
    for (const invoice of [undefined, "83", -1, 8.3, null]) {
      const parsed = parseStripeSummary({ ...good, appStore: { status: "stale", count: 53, invoice, asOf: good.lastSyncedAt } })
      expect(parsed?.appStore, String(invoice)).toEqual({ status: "stale", count: 53, asOf: good.lastSyncedAt })
    }
  })
})

describe("feedOf", () => {
  it("maps the view to what screens show", () => {
    expect(feedOf(LOADING_VIEW)).toEqual({ kind: "loading" })
    expect(feedOf({ phase: "ready", summary: NOT_CONNECTED })).toEqual({ kind: "sample" })
    expect(feedOf({ phase: "ready", summary: liveSummary("stale") })).toMatchObject({
      kind: "live",
      stale: true,
      lastSyncedAt: new Date("2026-10-13T14:41:00.000Z"),
      appStore: { status: "connected", count: 53, invoice: 83 },
    })
    // A summary without the field (an older server) reads as App Store not connected.
    const { appStore: _a, ...bare } = liveSummary("connected")
    void _a
    expect(feedOf({ phase: "ready", summary: bare })).toMatchObject({ appStore: { status: "not_connected" } })
  })
})
