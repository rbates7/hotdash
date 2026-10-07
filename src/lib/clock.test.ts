import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CENTRAL,
  addDays,
  daysBetween,
  formatDate,
  inPeriod,
  isIsoDay,
  periodBefore,
  daysEnding,
  formatDayShort,
  formatWindowSpan,
  formatPeriod,
  windowsEnding,
  now,
  periodEnding,
  toDay,
  todayIn,
} from "@/lib/clock"
import { MOCK_DAY } from "@/lib/kpis"

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
    expect(CENTRAL).toBe("America/Chicago")
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

describe("every formatter is Central, never the machine zone", () => {
  // 23:30 CT on 7 Oct 2026 (CDT). In UTC it is already 04:30 on the 8th —
  // the window where a UTC server and a Central browser used to disagree.
  const LATE = new Date("2026-10-08T04:30:00.000Z")

  it("23:30 CT is still the 7th everywhere an instant is accepted", () => {
    vi.useFakeTimers({ now: LATE })
    const instant = now()
    // The naive reading (UTC getters) says the 8th; ours must not.
    expect(instant.getUTCDate()).toBe(8)
    expect(toDay(instant)).toBe("2026-10-07")
    expect(formatDate(instant)).toBe("7 Oct 2026")
    expect(periodEnding(instant)).toEqual({ start: "2026-09-10", end: "2026-10-07" })
    expect(formatPeriod(periodEnding(instant))).toBe("10 Sep – 7 Oct 2026")
    expect(windowsEnding(instant, 6).at(-1)).toEqual({ start: "2026-09-10", end: "2026-10-07" })
    expect(addDays(instant, -3)).toBe("2026-10-04")
    expect(daysBetween("2026-10-01", instant)).toBe(6)
  })

  it("server (UTC) and browser (Central) render the same header for the same instant", () => {
    // Both sides derive from the one `today` the server computed; neither
    // reads its own clock, so the strings are byte-identical.
    const server = formatPeriod(periodEnding(todayIn(LATE)))
    const browser = formatPeriod(periodEnding(toDay(LATE)))
    expect(server).toBe(browser)
    expect(server).toBe("10 Sep – 7 Oct 2026")
  })

  it("23:30 CT on New Year's Eve stays in the old year (CST)", () => {
    const nye = new Date("2026-01-01T05:30:00.000Z")
    expect(formatDate(nye)).toBe("31 Dec 2025")
    expect(formatWindowSpan(windowsEnding(nye, 6))).toBe("17 Jul – 31 Dec 2025")
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

describe("addDays / daysBetween", () => {
  it("counts whole days both ways", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6)
    expect(daysBetween("2026-10-07", "2026-10-01")).toBe(-6)
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1)
  })

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

  it("windows are six back-to-back 28-day periods ending today, labelled honestly", () => {
    const windows = windowsEnding("2026-08-21", 6)
    expect(windows).toHaveLength(6)
    expect(windows.at(-1)).toEqual({ start: "2026-07-25", end: "2026-08-21" })
    expect(windows.at(-2)).toEqual({ start: "2026-06-27", end: "2026-07-24" })
    expect(windows[0]).toEqual({ start: "2026-03-07", end: "2026-04-03" })
    for (let i = 1; i < windows.length; i++) {
      expect(addDays(windows[i - 1].end, 1)).toBe(windows[i].start)
    }
    expect(formatWindowSpan(windows)).toBe("7 Mar – 21 Aug 2026")
    expect(formatWindowSpan(windowsEnding("2026-02-10", 6))).toBe("27 Aug 2025 – 10 Feb 2026")
    expect(formatDayShort("2026-10-07")).toBe("7 Oct")
    expect(daysEnding("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"])
  })

})

describe("isIsoDay", () => {
  it("accepts only canonical calendar days that survive a round trip", () => {
    expect(isIsoDay("2026-08-21")).toBe(true)
    expect(isIsoDay("2024-02-29")).toBe(true)
    expect(isIsoDay("2026-13-45")).toBe(false)
    expect(isIsoDay("2026-02-30")).toBe(false)
    expect(isIsoDay("2026-8-3")).toBe(false)
    expect(isIsoDay("2026-08-21T00:00:00Z")).toBe(false)
    expect(isIsoDay(20260821)).toBe(false)
    expect(isIsoDay(null)).toBe(false)
  })
})

describe("periods", () => {
  it("the prior period is the 28 days before the current one, and inPeriod is inclusive", () => {
    const period = periodEnding("2026-08-21")
    expect(periodBefore(period)).toEqual({ start: "2026-06-27", end: "2026-07-24" })
    expect(inPeriod("2026-07-25", period)).toBe(true)
    expect(inPeriod("2026-08-21", period)).toBe(true)
    expect(inPeriod("2026-07-24", period)).toBe(false)
    expect(inPeriod("2026-08-22", period)).toBe(false)
  })
})
