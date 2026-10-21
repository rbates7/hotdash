import { describe, expect, it } from "vitest"

import { liveCard, metricsSubscribers, stripeLiveLabels, listOf, NOT_IN_SYNC_TEXT, NRR_NOTE } from "@/lib/live-metrics"
import type { StripeFeed } from "@/lib/stripe-summary"
import { parseExtras, parseStripeSummary } from "@/lib/stripe-summary"
import {
  parseSubscriberList,
  planText,
  reasonText,
  subscriberListReducer,
  subscriberListState,
  subscriberListNotConnected,
  whoText,
} from "@/lib/stripe-subscribers"
import { metricsSubscriberRows, PAST_DUE_UNSPLIT_NOTE } from "@/lib/subscriber-total"
import { offerIntroduced } from "@/components/metrics/metrics-store"
import {
  APP_STORE_CONNECTED,
  APP_STORE_ZERO,
  LIVE_EXTRAS,
  LIVE_METRICS,
  LIVE_METRICS_CORE,
  LIVE_METRICS_FULL,
  NEW_ROWS,
  SYNCED_AT,
  liveSummary,
  subscriberList,
} from "@/test/stripe-fixture"

const TZ = "America/Chicago"
const live = (metrics = LIVE_METRICS_FULL, stale = false): Extract<StripeFeed, { kind: "live" }> => ({
  kind: "live",
  stale,
  lastSyncedAt: new Date(SYNCED_AT),
  metrics,
  appStore: APP_STORE_CONNECTED,
})
const card = (id: Parameters<typeof liveCard>[0], feed: StripeFeed = live()) =>
  liveCard(id, feed, { kind: "not_connected" }, TZ, { expenses: [], today: "2026-10-13" })

describe("parseExtras: tolerant, optional, known keys only", () => {
  it("keeps every well-formed field", () => {
    expect(parseExtras({ ...LIVE_EXTRAS })).toEqual(LIVE_EXTRAS)
  })
  it("copies only known keys; a malformed field rejects the summary (#77 always sends them)", () => {
    const ok = parseStripeSummary(JSON.parse(JSON.stringify({ ...liveSummary("connected", LIVE_METRICS_FULL), metrics: { ...LIVE_METRICS_FULL, junk: 1 } })))!
    expect(ok.metrics!.revenue).toEqual(LIVE_EXTRAS.revenue)
    expect((ok.metrics as Record<string, unknown>).junk).toBeUndefined()
    const bad = { ...liveSummary("connected", LIVE_METRICS_FULL), metrics: { ...LIVE_METRICS_FULL, arr: { value: "x" } } }
    expect(parseStripeSummary(JSON.parse(JSON.stringify(bad)))).toBeNull()
  })
  it("null rates are fine; bad days or negative counts drop trials", () => {
    expect(parseExtras({ arpu: { value: null, previous: null } }).arpu).toEqual({ value: null, previous: null })
    expect(parseExtras({ trialsStartedPerDay: { series: [{ date: "13 Oct", count: 1 }], total: 1, previousTotal: 0 } })).toEqual({})
    expect(parseExtras({ pastDue: { value: -1, mrr: 0 } })).toEqual({})
  })
  it("an older summary with none of them still parses", () => {
    expect(parseStripeSummary(JSON.parse(JSON.stringify(liveSummary())))).toEqual(liveSummary())
  })
})

describe("Metrics cards from the provisional fields", () => {
  it("ARR, Revenue, ARPU, LTV, NRR and Trials per day are live", () => {
    const value = (id: Parameters<typeof liveCard>[0]) => {
      const s = card(id)
      return s.kind === "live" ? s.metric.value : s.kind
    }
    expect(value("arr")).toBe(734_814.72)
    expect(value("revenue")).toBe(63_410)
    expect(value("arpu")).toBe(55.17)
    expect(value("ltv")).toBe(1_874.12)
    expect(value("nrr")).toBe(101.4)
    expect(value("trials_per_day")).toBe(40)
    const t = card("trials_per_day")
    expect(t.kind === "live" && t.metric.days).toHaveLength(28)
    expect(t.kind === "live" && t.metric.previous).toBe(32)
  })
  it("a missing field is an em dash with why, and no Last updated", () => {
    const s = card("arr", live(LIVE_METRICS_CORE, true))
    expect(s).toMatchObject({ kind: "live", metric: { value: null, empty: NOT_IN_SYNC_TEXT, updated: null } })
  })
  it("NRR says it is at current prices when #77's basis is current_prices, and only then", () => {
    const s = card("nrr", live(LIVE_METRICS_FULL))
    expect(s.kind === "live" && s.metric.note).toBe(NRR_NOTE)
    expect(NRR_NOTE).toBe("At current prices")
    const other = { ...LIVE_METRICS_FULL, nrr: { ...LIVE_EXTRAS.nrr, basis: "historical" } } as unknown as typeof LIVE_METRICS_FULL
    const o = card("nrr", live(other))
    expect(o.kind === "live" && o.metric.note).toBeUndefined()
  })
  it("a null rate says why", () => {
    const s = card("ltv", live({ ...LIVE_METRICS_FULL, ltv: { value: null, previous: null } }))
    expect(s.kind === "live" && s.metric.empty).toMatch(/churn/)
  })
  it("Trials per day with nothing before has no trend", () => {
    const s = card("trials_per_day", live({ ...LIVE_METRICS_FULL, trialsStartedPerDay: { ...LIVE_EXTRAS.trialsStartedPerDay, previousTotal: 0 } }))
    expect(s.kind === "live" && s.metric.previous).toBeNull()
  })
  it("CAC, NPS, Runway and Valuation stay not connected", () => {
    for (const id of ["cac", "nps", "runway", "valuation"] as const) expect(card(id)).toEqual({ kind: "not_connected", source: null })
  })
  it("the notice names only the cards this sync feeds", () => {
    expect(listOf(stripeLiveLabels(LIVE_METRICS_CORE))).toBe("MRR, Churn Rate, Trial Conversions and Subscribers")
    expect(stripeLiveLabels(LIVE_METRICS_FULL)).toContain("Trials per day")
  })
})

describe("Metrics › Subscribers lines", () => {
  it("headline is Stripe paying; Past due amber with MRR; App Store and Free separate", () => {
    const m = metricsSubscribers(live(), TZ)
    expect(m.value).toBe(1_079)
    expect(m.breakdown!.rows).toEqual([
      { key: "pastDue", label: "Past due", value: "12 · $480 MRR", tone: "attention" },
      { key: "appStore", label: "App Store", value: "53" },
      { key: "freeAccounts", label: "Free (never paid)", value: "174" },
    ])
    expect(m.breakdown!.note).toBeNull()
  })
  it("zero past due is not amber; no split says the headline holds them; suspect App Store wins the note", () => {
    expect(metricsSubscriberRows({ ...LIVE_METRICS, pastDue: { value: 0, mrr: 0 } }, APP_STORE_CONNECTED, TZ).rows[0]).toEqual({
      key: "pastDue",
      label: "Past due",
      value: "0",
    })
    expect(metricsSubscriberRows(LIVE_METRICS_CORE, APP_STORE_CONNECTED, TZ).note).toBe(PAST_DUE_UNSPLIT_NOTE)
    expect(metricsSubscriberRows(LIVE_METRICS, APP_STORE_ZERO, TZ).note).toMatch(/App Store read 0/)
  })
  it("does not wait for the App Store (not in the headline)", () => {
    const s = card("subscribers", { ...live(), appStore: { status: "connecting" } })
    expect(s.kind).toBe("live")
  })
})

describe("parseSubscriberList", () => {
  it("reads a list, null-safe, newest first, at most 100", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ ...NEW_ROWS[0], subscriptionId: `sub_${i}`, at: new Date(Date.UTC(2026, 9, 1, i)).toISOString() }))
    const l = parseSubscriberList({ ...subscriberList("new"), rows, total: 120 }, "new")!
    expect(l.rows).toHaveLength(100)
    expect(l.rows[0].subscriptionId).toBe("sub_119")
    expect(l.total).toBe(120)
  })
  it("drops bad rows, nulls bad fields, ignores reason on new", () => {
    const l = parseSubscriberList(
      { ...subscriberList("new"), rows: [{ subscriptionId: "s", at: SYNCED_AT, customerName: "  ", interval: "fortnight", mrr: "9", reason: "x" }, { at: SYNCED_AT }] },
      "new"
    )!
    expect(l.rows).toEqual([{ subscriptionId: "s", customerName: null, customerEmail: null, plan: null, interval: null, mrr: null, at: SYNCED_AT, reason: null }])
  })
  it("rejects the wrong list or a bad status", () => {
    expect(parseSubscriberList(subscriberList("churned"), "new")).toBeNull()
    expect(parseSubscriberList({ status: "ok" }, "new")).toBeNull()
    expect(parseSubscriberList({ status: "connecting", rows: [{}] }, "new")).toEqual({ ...subscriberListNotConnected("new"), status: "connecting" })
  })
})

describe("list states", () => {
  it("401 is session expired; failure keeps rows stale, else not connected", () => {
    const ready = { phase: "ready" as const, list: subscriberList("new") }
    expect(subscriberListState(subscriberListReducer(ready, { kind: "unauthorized" }, "new"))).toEqual({ kind: "session_expired" })
    expect(subscriberListState(subscriberListReducer(ready, { kind: "error" }, "new"))).toMatchObject({ kind: "live", stale: true })
    // A failed first read is an error line, not Not connected (Stripe may be live); the server's own not connected stays.
    expect(subscriberListState(subscriberListReducer({ phase: "loading" }, { kind: "error" }, "new"))).toEqual({ kind: "error", lastTriedAt: null })
    const off = { phase: "ready" as const, list: subscriberListNotConnected("new") }
    expect(subscriberListState(subscriberListReducer(off, { kind: "error" }, "new"))).toEqual({ kind: "not_connected" })
  })
  it("a persisting list error says when it last tried; one failure does not", () => {
    const first = subscriberListReducer({ phase: "loading" }, { kind: "error" }, "new", new Date("2026-10-14T02:40:00Z"))
    expect(subscriberListState(first)).toEqual({ kind: "error", lastTriedAt: null })
    const second = subscriberListReducer(first, { kind: "error" }, "new", new Date("2026-10-14T02:41:00Z"))
    expect(second).toMatchObject({ phase: "error", failures: 2 })
    expect(subscriberListState(second)).toEqual({ kind: "error", lastTriedAt: new Date("2026-10-14T02:41:00Z") })
    // A good read clears it.
    expect(subscriberListReducer(second, { kind: "ok", data: subscriberList("new") }, "new").phase).toBe("ready")
  })
  it("words for rows", () => {
    expect(whoText({ customerName: null, customerEmail: "a@example.com" })).toEqual({ title: "a@example.com", email: null })
    expect(whoText({ customerName: null, customerEmail: null })).toEqual({ title: "\u2014", email: null })
    expect(planText({ plan: "Coach Pro", interval: "year" })).toBe("Coach Pro · Annual")
    expect(planText({ plan: null, interval: null })).toBe("\u2014")
    expect(reasonText("payment_failed")).toBe("Payment failed")
    expect(reasonText("something_else")).toBe("Something else")
    expect(reasonText(null)).toBe("\u2014")
  })
})

describe("offerIntroduced", () => {
  it("adds Trials per day once after Trial Conversions; a removal sticks", () => {
    const first = offerIntroduced(["mrr", "trials", "expenses"], undefined)
    expect(first.visible).toEqual(["mrr", "trials", "trials_per_day", "expenses"])
    expect(offerIntroduced(["mrr"], first.offered).visible).toEqual(["mrr"])
    expect(offerIntroduced([], undefined).visible).toEqual(["trials_per_day"])
  })
})
