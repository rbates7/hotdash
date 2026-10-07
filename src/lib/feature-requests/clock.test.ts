import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  calendarDaysAgo,
  daysAgo,
  formatDate,
  now,
  relativeLabel,
} from "@/lib/feature-requests/clock"
import { SEED_ROWS, buildSeed } from "@/lib/feature-requests/fixture"

// 15:00 UTC = 10:00 in Chicago, so a day either side stays on the same date.
const TODAY = new Date("2026-08-24T15:00:00.000Z")

describe("clock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(TODAY)
  })
  afterEach(() => vi.useRealTimers())

  it("now() is the real (here: faked) system clock, never a constant", () => {
    expect(now().toISOString()).toBe(TODAY.toISOString())
    vi.setSystemTime(new Date("2027-01-02T03:04:05.000Z"))
    expect(now().toISOString()).toBe("2027-01-02T03:04:05.000Z")
  })

  it("daysAgo keeps the time of day", () => {
    expect(daysAgo(2).toISOString()).toBe("2026-08-22T15:00:00.000Z")
    expect(daysAgo(0).toISOString()).toBe(TODAY.toISOString())
  })

  it("formats dates the way the mock prints them, in Central time", () => {
    expect(formatDate("2026-08-24T15:00:00.000Z")).toBe("24 Aug 2026")
    expect(formatDate("2026-07-09T15:00:00.000Z")).toBe("9 Jul 2026")
    expect(formatDate("2026-09-11T15:00:00.000Z")).toBe("11 Sep 2026")
    // 03:00 UTC is still the previous evening in Chicago.
    expect(formatDate("2026-08-25T03:00:00.000Z")).toBe("24 Aug 2026")
  })

  it("counts calendar days, not 24-hour blocks", () => {
    expect(calendarDaysAgo("2026-08-24T04:30:00.000Z")).toBe(1) // 23:30 on the 23rd in Chicago
    expect(calendarDaysAgo("2026-08-24T14:00:00.000Z")).toBe(0)
    expect(calendarDaysAgo("2026-08-22T15:00:00.000Z")).toBe(2)
  })

  it("labels relative age in plain words", () => {
    expect(relativeLabel(daysAgo(0).toISOString())).toBe("today")
    expect(relativeLabel(daysAgo(1).toISOString())).toBe("yesterday")
    expect(relativeLabel(daysAgo(5).toISOString())).toBe("5 days ago")
    expect(relativeLabel(daysAgo(13).toISOString())).toBe("13 days ago")
    expect(relativeLabel(daysAgo(20).toISOString())).toBe("2 weeks ago")
    expect(relativeLabel(daysAgo(46).toISOString())).toBe("6 weeks ago")
    expect(relativeLabel(daysAgo(95).toISOString())).toBe("3 months ago")
  })
})

describe("seed", () => {
  it("is generated relative to the instant it is given, never a fixed date", () => {
    const a = buildSeed(TODAY)
    const b = buildSeed(new Date("2027-03-01T15:00:00.000Z"))
    expect(a[0].createdAt).toBe(TODAY.toISOString())
    expect(b[0].createdAt).toBe("2027-03-01T15:00:00.000Z")
    expect(a.map((r) => r.title)).toEqual(b.map((r) => r.title))
  })

  it("reproduces the mock's dates when today is 24 Aug 2026", () => {
    const seed = buildSeed(TODAY)
    expect(seed.map((r) => formatDate(r.createdAt))).toEqual([
      "24 Aug 2026", "22 Aug 2026", "19 Aug 2026",
      "14 Aug 2026", "11 Aug 2026", "4 Aug 2026",
      "29 Jul 2026", "22 Jul 2026",
      "18 Jul 2026", "9 Jul 2026",
    ])
  })

  it("has ten cards, all from Dan, all tagged as sample data, none in the future", () => {
    const seed = buildSeed(TODAY)
    expect(seed).toHaveLength(10)
    expect(SEED_ROWS).toHaveLength(10)
    for (const r of seed) {
      expect(r.from).toBe("Dan")
      expect(r.sample).toBe(true)
      expect(new Date(r.createdAt).getTime()).toBeLessThanOrEqual(TODAY.getTime())
      expect(r.updatedAt).toBe(r.createdAt)
    }
    expect(seed.filter((r) => r.status === "inbox")).toHaveLength(3)
    expect(seed.filter((r) => r.status === "triaged")).toHaveLength(3)
    expect(seed.filter((r) => r.status === "roadmap")).toHaveLength(2)
    expect(seed.filter((r) => r.status === "parked")).toHaveLength(2)
  })
})
