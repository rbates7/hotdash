import { afterEach, describe, expect, it, vi } from "vitest"

import {
  TIME_ZONE,
  addDays,
  formatDate,
  formatMonthSpan,
  formatPeriod,
  monthsEnding,
  now,
  periodEnding,
  todayIn,
} from "@/lib/metrics/clock"
import {
  MOCK_DAY,
  seedChurnedSubscribers,
  seedExpenses,
  seedNewSubscribers,
} from "@/lib/metrics-fixture"

afterEach(() => {
  vi.useRealTimers()
})

/** Two instants on either side of a UTC midnight that is still "yesterday" in Chicago. */
const INSTANTS = [
  // 10:30pm Central on 7 Oct 2026 (CDT, UTC−5) is already 8 Oct in UTC.
  { at: "2026-10-08T03:30:00.000Z", today: "2026-10-07", label: "10 Sep – 7 Oct 2026" },
  // 11:30pm Central on 31 Dec 2025 (CST, UTC−6) is already 2026 in UTC.
  { at: "2026-01-01T05:30:00.000Z", today: "2025-12-31", label: "4 Dec – 31 Dec 2025" },
] as const

describe("now → today", () => {
  it.each(INSTANTS)("$at is $today in America/Chicago", ({ at, today }) => {
    vi.useFakeTimers({ now: new Date(at) })
    expect(TIME_ZONE).toBe("America/Chicago")
    expect(now().toISOString()).toBe(at)
    expect(todayIn(now())).toBe(today)
  })

  it("reads the real clock, not a frozen one", () => {
    const before = Date.now()
    const t = now().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Date.now())
  })

  it("respects another zone when asked", () => {
    expect(todayIn(new Date("2026-10-08T03:30:00.000Z"), "UTC")).toBe("2026-10-08")
  })
})

describe("period", () => {
  it.each(INSTANTS)("is the trailing four weeks ending $today", ({ at, today, label }) => {
    vi.useFakeTimers({ now: new Date(at) })
    const period = periodEnding(todayIn(now()))
    expect(period.end).toBe(today)
    expect(period.start).toBe(addDays(today, -27))
    expect(formatPeriod(period)).toBe(label)
  })

  it("prints the year on both ends when the window straddles New Year", () => {
    expect(formatPeriod(periodEnding("2026-01-10"))).toBe("14 Dec 2025 – 10 Jan 2026")
  })

  it("reproduces the mock's label on the day the mock was drawn", () => {
    expect(formatPeriod(periodEnding(MOCK_DAY))).toBe("25 Jul – 21 Aug 2026")
  })
})

describe("addDays", () => {
  it("crosses month, year and DST boundaries by whole calendar days", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2026-03-09", -1)).toBe("2026-03-08") // US spring-forward weekend
    expect(addDays("2026-11-02", -1)).toBe("2026-11-01") // US fall-back weekend
    expect(addDays("2026-08-21", 0)).toBe("2026-08-21")
  })
})

describe("formatting", () => {
  it("dates print as day month year", () => {
    expect(formatDate("2026-08-18")).toBe("18 Aug 2026")
    expect(formatDate("2025-09-04")).toBe("4 Sep 2025")
    expect(formatDate("not-a-date")).toBe("not-a-date")
  })

  it("months ending in today's month, oldest first, wrapping the year", () => {
    expect(monthsEnding("2026-08-21", 6).map((m) => m.label)).toEqual(["Mar", "Apr", "May", "Jun", "Jul", "Aug"])
    expect(monthsEnding("2026-02-10", 6)).toEqual([
      { label: "Sep", year: 2025 },
      { label: "Oct", year: 2025 },
      { label: "Nov", year: 2025 },
      { label: "Dec", year: 2025 },
      { label: "Jan", year: 2026 },
      { label: "Feb", year: 2026 },
    ])
    expect(formatMonthSpan(monthsEnding("2026-08-21", 6))).toBe("Mar – Aug 2026")
    expect(formatMonthSpan(monthsEnding("2026-02-10", 6))).toBe("Sep 2025 – Feb 2026")
  })
})

describe("seed rows", () => {
  it.each(INSTANTS)("never postdate today ($today) and are not months stale", ({ at, today }) => {
    vi.useFakeTimers({ now: new Date(at) })
    const day = todayIn(now())
    expect(day).toBe(today)
    const expenses = seedExpenses(day)
    const fresh = seedNewSubscribers(day)
    const churned = seedChurnedSubscribers(day)

    for (const d of [
      ...expenses.map((e) => e.date),
      ...fresh.map((s) => s.signupDate),
      ...churned.flatMap((s) => [s.signupDate, s.churnDate]),
    ]) {
      expect(d <= day).toBe(true)
    }
    // Recent activity sits inside the trailing month.
    const floor = addDays(day, -37)
    for (const d of [...expenses.map((e) => e.date), ...churned.map((s) => s.churnDate)]) {
      expect(d >= floor).toBe(true)
    }
    expect(expenses.some((e) => e.date === day)).toBe(true)
  })

  it("reproduce the mock on the day it was drawn", () => {
    expect(seedExpenses(MOCK_DAY).map((e) => e.date)).toEqual([
      "2026-08-18", "2026-08-21", "2026-08-01", "2026-08-08", "2026-08-15", "2026-08-12", "2026-08-04", "2026-08-03",
    ])
    expect(seedNewSubscribers(MOCK_DAY)[0].signupDate).toBe("2026-08-18")
    expect(seedNewSubscribers(MOCK_DAY).at(-1)!.signupDate).toBe("2026-07-22")
    const brett = seedChurnedSubscribers(MOCK_DAY)[0]
    expect([brett.signupDate, brett.churnDate]).toEqual(["2026-01-12", "2026-08-08"])
    const nina = seedChurnedSubscribers(MOCK_DAY)[1]
    expect([nina.signupDate, nina.churnDate]).toEqual(["2025-09-04", "2026-08-02"])
  })
})
