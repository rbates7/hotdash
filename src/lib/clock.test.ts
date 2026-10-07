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
  formatRelative,
  formatRelativeDay,
  formatWindowSpan,
  formatPeriod,
  windowsEnding,
  now,
  periodEnding,
  toDay,
  todayIn,
} from "@/lib/clock"
import { MOCK_DAY } from "@/lib/kpis"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"

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
  const LATE = LATE_EVENING_CT

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

describe("formatRelative — the one relative-time formatter, three styles", () => {
  // 13:00 CT on Wed 7 Oct 2026.
  const NOW = Date.parse("2026-10-07T18:00:00.000Z")
  const ago = (ms: number, style?: "ago" | "compact" | "long") => formatRelative(NOW - ms, NOW, style ? { style } : undefined)
  const H = 3_600_000

  it("`ago` (default) is the ticket view's exact copy", () => {
    expect(ago(20_000)).toBe("just now")
    expect(ago(5 * 60_000)).toBe("5m ago")
    expect(ago(2 * H)).toBe("2h ago")
    expect(ago(14 * H)).toBe("14h ago")
    expect(ago(26 * H)).toBe("1d ago")
    expect(ago(10 * 24 * H)).toBe("10d ago")
    expect(ago(5 * 60_000, "ago")).toBe("5m ago")
  })

  it("`compact` is the Inbox's exact copy", () => {
    expect(ago(20_000, "compact")).toBe("now")
    expect(ago(18 * 60_000, "compact")).toBe("18m")
    expect(ago(2 * H, "compact")).toBe("2h")
    expect(ago(10 * H, "compact")).toBe("10h")
    expect(ago(24 * H, "compact")).toBe("Yesterday")
    expect(ago(47 * H, "compact")).toBe("Yesterday")
    expect(ago(48 * H, "compact")).toBe("2d")
  })

  it("`long` is opt-in and uses Central calendar days", () => {
    expect(ago(20_000, "long")).toBe("just now")
    expect(ago(5 * 60_000, "long")).toBe("5 min ago")
    expect(ago(3 * H, "long")).toBe("3 h ago") // 10:00 today
    expect(ago(14 * H, "long")).toBe("Yesterday") // 23:00 yesterday — never "14 h ago"
    expect(ago(36 * H, "long")).toBe("Yesterday") // 01:00 yesterday
    expect(ago(38 * H, "long")).toBe("Mon, Oct 5") // 23:00 Monday
    expect(ago(10 * 24 * H, "long")).toBe("Sun, Sep 27")
  })

  it("`long` reads the calendar in Central even late in the evening (same answer in every process zone)", () => {
    expect(formatRelative(LATE_EVENING_CT_MS - 1.5 * H, LATE_EVENING_CT_MS, { style: "long" })).toBe("1 h ago")
    expect(formatRelative(LATE_EVENING_CT_MS - 24 * H, LATE_EVENING_CT_MS, { style: "long" })).toBe("Yesterday")
    expect(formatRelative(LATE_EVENING_CT_MS - 48 * H, LATE_EVENING_CT_MS, { style: "long" })).toBe("Mon, Oct 5")
    const justAfterMidnightCt = Date.parse("2026-10-08T05:30:00.000Z")
    expect(formatRelative(justAfterMidnightCt - 2 * H, justAfterMidnightCt, { style: "long" })).toBe("Yesterday")
  })
})

describe("formatRelativeDay — calendar days in Central, both directions", () => {
  it("names the near days and counts the rest", () => {
    const today = "2026-10-07"
    expect(formatRelativeDay("2026-10-07", today)).toBe("Today")
    expect(formatRelativeDay("2026-10-08", today)).toBe("Tomorrow")
    expect(formatRelativeDay("2026-10-06", today)).toBe("Yesterday")
    expect(formatRelativeDay("2026-10-22", today)).toBe("in 15 days")
    expect(formatRelativeDay("2026-07-18", today)).toBe("81 days ago")
    expect(formatRelativeDay("2026-10-09", today)).toBe("in 2 days")
    expect(formatRelativeDay("2026-10-05", today)).toBe("2 days ago")
  })

  it("reads instants as Central days: 23:30 CT is still today, and a date just past Central midnight is Tomorrow", () => {
    // LATE_EVENING_CT is 23:30 CT on 7 Oct — already 8 Oct in UTC.
    expect(formatRelativeDay(LATE_EVENING_CT, LATE_EVENING_CT)).toBe("Today")
    expect(formatRelativeDay("2026-10-07", LATE_EVENING_CT)).toBe("Today")
    expect(formatRelativeDay("2026-10-08", LATE_EVENING_CT)).toBe("Tomorrow")
    // 00:30 CT on 8 Oct (05:30Z): the next Central day, one day after the late evening.
    const justAfterMidnightCt = new Date("2026-10-08T05:30:00.000Z")
    expect(formatRelativeDay(justAfterMidnightCt, LATE_EVENING_CT)).toBe("Tomorrow")
    expect(formatRelativeDay(LATE_EVENING_CT, justAfterMidnightCt)).toBe("Yesterday")
    // A sprint ending 24 Oct at 00:30 CT, seen at 23:30 CT on 7 Oct, is "in 17 days".
    expect(formatRelativeDay(new Date("2026-10-24T05:30:00.000Z"), LATE_EVENING_CT)).toBe("in 17 days")
  })

  it("crosses DST and New Year by calendar days", () => {
    expect(formatRelativeDay("2026-03-09", "2026-03-07")).toBe("in 2 days") // US spring-forward weekend
    expect(formatRelativeDay("2026-01-01", "2025-12-31")).toBe("Tomorrow")
    expect(formatRelativeDay("2025-12-31", "2026-01-01")).toBe("Yesterday")
  })
})
