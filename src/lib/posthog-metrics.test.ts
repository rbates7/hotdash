import { describe, expect, it } from "vitest"

import { computePosthogMetrics, LOOKBACK_DAYS, type PosthogData } from "@/lib/posthog-metrics"
import { POSTHOG_NOT_CONNECTED, parsePosthogSummary, posthogFeedOf } from "@/lib/posthog-summary"
import { LIVE_POSTHOG_METRICS, livePosthogSummary } from "@/test/posthog-fixture"

const NOW = Date.parse("2026-10-14T17:00:00.000Z") / 1000
const DAY = 86_400

/** PostHog set up 135 days ago (early June): windows 0–3 are whole, 4–6 are not. */
const DATA: PosthogData = {
  now: NOW,
  earliest: NOW - 135 * DAY,
  windows: [
    { w: 0, active: 812, retained: 0 },
    { w: 1, active: 774, retained: 452 },
    { w: 2, active: 702, retained: 390 },
    { w: 3, active: 610, retained: 300 },
    // Partly before PostHog: counted by the query, but not a whole window.
    { w: 4, active: 95, retained: 80 },
  ],
  recent: { day: 214, week: 455 },
}

describe("computePosthogMetrics", () => {
  it("active users: people with any event per 28-day window, oldest first, none before PostHog", () => {
    const m = computePosthogMetrics(DATA)
    expect(m.activeUsers).toEqual({ value: 812, previous: 774, series: [null, null, 610, 702, 774, 812], day: 214, week: 455 })
  })

  it("retention: of the people active in the window before, the share active again — needs that window whole", () => {
    const m = computePosthogMetrics(DATA)
    expect(m.retention.value).toBeCloseTo((452 / 774) * 100, 9)
    expect(m.retention.previous).toBeCloseTo((390 / 702) * 100, 9)
    // Into window 2 the base is window 3 (whole); into window 3 it is window 4 (not whole).
    expect(m.retention.series.map((v) => (v === null ? null : Number(v.toFixed(2))))).toEqual([null, null, null, 49.18, 55.56, 58.4])
    expect(m.retention.retained).toBe(452)
    expect(m.retention.base).toBe(774)
    expect(m.since).toBe(new Date((NOW - 135 * DAY) * 1000).toISOString())
  })

  it("a covered window nobody was active in is 0 active and no retention (nothing to divide), never a made-up rate", () => {
    const m = computePosthogMetrics({ ...DATA, windows: [{ w: 0, active: 3, retained: 0 }] })
    expect(m.activeUsers.value).toBe(3)
    expect(m.activeUsers.previous).toBe(0)
    expect(m.retention.value).toBeNull()
    expect(m.retention.base).toBe(0)
  })

  it("no events at all: every figure is empty, not 0", () => {
    const m = computePosthogMetrics({ ...DATA, earliest: null, windows: [], recent: { day: 0, week: 0 } })
    expect(m.activeUsers.value).toBeNull()
    expect(m.activeUsers.series.every((v) => v === null)).toBe(true)
    expect(m.retention.value).toBeNull()
    expect(m.retention.base).toBeNull()
    expect(m.since).toBeNull()
  })

  it("PostHog newer than one window: no whole window, so no active-users figure yet", () => {
    const m = computePosthogMetrics({ ...DATA, earliest: NOW - 20 * DAY })
    expect(m.activeUsers.value).toBeNull()
    expect(m.retention.value).toBeNull()
  })

  it("a full lookback of history covers every window, allowing a quiet first day", () => {
    const m = computePosthogMetrics({ ...DATA, earliest: NOW - LOOKBACK_DAYS * DAY + DAY - 1 })
    expect(m.activeUsers.series.every((v) => v !== null)).toBe(true)
    expect(m.retention.series.at(0)).toBeNull() // window 6 had nobody in DATA
  })

  it("throws on a reading that does not add up", () => {
    const bad: PosthogData[] = [
      { ...DATA, now: 0 },
      { ...DATA, earliest: NOW + 10 },
      { ...DATA, recent: { day: 9, week: 3 } },
      { ...DATA, recent: { day: -1, week: 3 } },
      { ...DATA, windows: [{ w: 0, active: 2, retained: 3 }] },
      { ...DATA, windows: [{ w: 7, active: 2, retained: 0 }] },
      { ...DATA, windows: [{ w: 1, active: 2, retained: 0 }, { w: 1, active: 2, retained: 0 }] },
      { ...DATA, windows: [{ w: 0, active: 1.5, retained: 0 }] },
    ]
    for (const data of bad) expect(() => computePosthogMetrics(data)).toThrow()
  })
})

describe("parsePosthogSummary", () => {
  it("round-trips the fixture and not_connected", () => {
    const live = livePosthogSummary("connected")
    expect(parsePosthogSummary(JSON.parse(JSON.stringify(live)))).toEqual(live)
    expect(parsePosthogSummary({ status: "not_connected" })).toEqual(POSTHOG_NOT_CONNECTED)
  })

  it("rejects anything incomplete", () => {
    const live = livePosthogSummary("stale")
    for (const bad of [
      null,
      "ok",
      { status: "weird" },
      { ...live, lastSyncedAt: "yesterday" },
      { ...live, metrics: null },
      { ...live, metrics: { ...LIVE_POSTHOG_METRICS, activeUsers: { ...LIVE_POSTHOG_METRICS.activeUsers, day: "1" } } },
      { ...live, metrics: { ...LIVE_POSTHOG_METRICS, retention: { ...LIVE_POSTHOG_METRICS.retention, series: "x" } } },
      { ...live, metrics: { ...LIVE_POSTHOG_METRICS, since: "June" } },
    ]) {
      expect(parsePosthogSummary(bad)).toBeNull()
    }
  })
})

describe("posthogFeedOf", () => {
  it("loading, not_connected with no key (never sample), live with stale flag otherwise", () => {
    expect(posthogFeedOf({ phase: "loading" })).toEqual({ kind: "loading" })
    expect(posthogFeedOf({ phase: "ready", summary: POSTHOG_NOT_CONNECTED })).toEqual({ kind: "not_connected" })
    const feed = posthogFeedOf({ phase: "ready", summary: livePosthogSummary("stale") })
    expect(feed).toMatchObject({ kind: "live", stale: true, metrics: LIVE_POSTHOG_METRICS })
  })
})
