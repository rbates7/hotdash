import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  CENTRAL,
  calendarDaysBetween,
  centralDate,
  dayKey,
  daysAgo,
  formatDate,
  monthLabel,
  quarterLabel,
  relativeLabel,
  requestNow,
  yearLabel,
} from "@/lib/roadmap/clock"
import { buildSeed } from "@/lib/roadmap/fixture"

// 15:00 UTC = 10:00 in Chicago, so a day either side stays on the same date.
const TODAY = Date.parse("2026-10-07T15:00:00.000Z")

// 23:30 CDT on 7 Oct = 04:30 UTC on 8 Oct: UTC, and most of the world east
// of Chicago, is already on the next day.
const LATE = "2026-10-08T04:30:00.000Z"
const LATE_MS = Date.parse(LATE)

/**
 * The same assertions run under both process zones Mack asked for, plus two
 * extremes, so a formatter that quietly fell back to the process zone would
 * fail in at least one of them.
 */
describe.each(["UTC", "America/Chicago", "Pacific/Kiritimati", "Asia/Tokyo"])(
  "clock under TZ=%s",
  (tz) => {
    const originalTz = process.env.TZ
    beforeAll(() => {
      process.env.TZ = tz
    })
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    })

    it("formats in Central and uses the agreed zone id", () => {
      expect(CENTRAL).toBe("America/Chicago")
      expect(formatDate(TODAY)).toBe("7 Oct 2026")
      expect(formatDate("2026-07-09T15:00:00.000Z")).toBe("9 Jul 2026")
      expect(formatDate("2026-09-11T15:00:00.000Z")).toBe("11 Sep 2026")
      // 03:00 UTC is still the previous evening in Chicago.
      expect(formatDate("2026-10-08T03:00:00.000Z")).toBe("7 Oct 2026")
      expect(dayKey(TODAY)).toBe("2026-10-07")
      expect(centralDate(TODAY)).toEqual({ year: 2026, month: 10, day: 7 })
    })

    describe("at 23:30 Central", () => {
      it("prints the Central date, not the UTC one", () => {
        expect(new Date(LATE).getUTCDate()).toBe(8)
        expect(formatDate(LATE)).toBe("7 Oct 2026")
        expect(dayKey(LATE)).toBe("2026-10-07")
        // The local clock is exercised too; whatever it says must not leak in.
        expect(new Date(LATE).getDate()).toBeDefined()
      })

      it("counts days from the Central calendar", () => {
        expect(relativeLabel("2026-10-07T15:00:00.000Z", LATE_MS)).toBe("today")
        expect(relativeLabel("2026-10-06T15:00:00.000Z", LATE_MS)).toBe("yesterday")
        // 00:30 CDT the next morning is tomorrow in Central, even though it
        // is the same UTC day as LATE.
        expect(calendarDaysBetween(LATE_MS, "2026-10-08T05:30:00.000Z")).toBe(1)
      })

      it("labels windows from the Central month, quarter and year", () => {
        expect(monthLabel(LATE_MS, 0)).toBe("Oct 2026")
        expect(quarterLabel(LATE_MS, 0)).toBe("Q4 2026")
        expect(yearLabel(LATE_MS, 0)).toBe("2026")
      })

      it("still seeds today's bet for today when today is nearly over", () => {
        const seed = buildSeed(LATE_MS)
        const today = seed.find((i) => i.title === "Parent recap emails")!
        expect(formatDate(today.signedAt)).toBe("7 Oct 2026")
        const twoDays = seed.find((i) => i.title === "Auto-scout from film")!
        expect(formatDate(twoDays.signedAt)).toBe("5 Oct 2026")
      })
    })
  }
)

describe("day arithmetic", () => {
  it("daysAgo lands at midday Central on the right calendar day", () => {
    expect(formatDate(daysAgo(TODAY, 0))).toBe("7 Oct 2026")
    expect(formatDate(daysAgo(TODAY, 2))).toBe("5 Oct 2026")
    expect(formatDate(daysAgo(TODAY, 40))).toBe("28 Aug 2026")
    // 18:00Z is 13:00 CDT / 12:00 CST — the same day in Central and in UTC.
    expect(new Date(daysAgo(TODAY, 0)).toISOString()).toBe("2026-10-07T18:00:00.000Z")
  })

  it("crosses the spring DST change without an off-by-one (24h subtraction would)", () => {
    // Clocks went forward at 02:00 CST on 8 Mar 2026. 00:30 CDT on 9 Mar is
    // 05:30 UTC; 24 hours earlier is 05:30 UTC on 8 Mar, which is still
    // 23:30 CST on 7 Mar — the wrong day. Calendar arithmetic is not fooled.
    const afterSpring = Date.parse("2026-03-09T05:30:00.000Z")
    expect(formatDate(afterSpring)).toBe("9 Mar 2026")
    expect(formatDate(afterSpring - 86_400_000)).toBe("7 Mar 2026")
    expect(formatDate(daysAgo(afterSpring, 1))).toBe("8 Mar 2026")
    expect(calendarDaysBetween(daysAgo(afterSpring, 1), afterSpring)).toBe(1)
  })

  it("crosses the autumn DST change without an off-by-one", () => {
    // Clocks went back at 02:00 CDT on 1 Nov 2026. 23:30 CST on 1 Nov is
    // 05:30 UTC on 2 Nov; 24 hours later is 05:30 UTC on 3 Nov, 23:30 CST on
    // 2 Nov — right by luck in this direction, but check the day count too.
    const afterFall = Date.parse("2026-11-02T05:30:00.000Z")
    expect(formatDate(afterFall)).toBe("1 Nov 2026")
    expect(formatDate(daysAgo(afterFall, 1))).toBe("31 Oct 2026")
    expect(formatDate(daysAgo(afterFall, 2))).toBe("30 Oct 2026")
    expect(calendarDaysBetween("2026-10-30T18:00:00.000Z", afterFall)).toBe(2)
  })

  it("counts calendar days, not 24-hour blocks", () => {
    expect(calendarDaysBetween("2026-10-07T04:30:00.000Z", TODAY)).toBe(1) // 23:30 on the 6th in Chicago
    expect(calendarDaysBetween("2026-10-07T14:00:00.000Z", TODAY)).toBe(0)
    expect(calendarDaysBetween("2026-10-05T15:00:00.000Z", TODAY)).toBe(2)
    expect(calendarDaysBetween(TODAY, "2026-10-05T15:00:00.000Z")).toBe(-2)
  })

  it("labels relative age in plain words", () => {
    expect(relativeLabel(daysAgo(TODAY, 0), TODAY)).toBe("today")
    expect(relativeLabel(daysAgo(TODAY, 1), TODAY)).toBe("yesterday")
    expect(relativeLabel(daysAgo(TODAY, 5), TODAY)).toBe("5 days ago")
    expect(relativeLabel(daysAgo(TODAY, 13), TODAY)).toBe("13 days ago")
    expect(relativeLabel(daysAgo(TODAY, 20), TODAY)).toBe("2 weeks ago")
    expect(relativeLabel(daysAgo(TODAY, 46), TODAY)).toBe("6 weeks ago")
    expect(relativeLabel(daysAgo(TODAY, 95), TODAY)).toBe("3 months ago")
  })
})

describe("window labels", () => {
  it("roll over months, quarters and years", () => {
    expect(monthLabel(TODAY, 0)).toBe("Oct 2026")
    expect(monthLabel(TODAY, 1)).toBe("Nov 2026")
    expect(monthLabel(TODAY, 3)).toBe("Jan 2027")
    expect(monthLabel(TODAY, -10)).toBe("Dec 2025")
    expect(quarterLabel(TODAY, 0)).toBe("Q4 2026")
    expect(quarterLabel(TODAY, 1)).toBe("Q1 2027")
    expect(quarterLabel(TODAY, 2)).toBe("Q2 2027")
    expect(quarterLabel(TODAY, -4)).toBe("Q4 2025")
    expect(yearLabel(TODAY, 1)).toBe("2027")
  })

  it("take the quarter from the Central month at the year boundary", () => {
    // 23:30 CST on 31 Dec 2026 is 05:30 UTC on 1 Jan 2027.
    const newYearsEve = Date.parse("2027-01-01T05:30:00.000Z")
    expect(quarterLabel(newYearsEve, 0)).toBe("Q4 2026")
    expect(monthLabel(newYearsEve, 0)).toBe("Dec 2026")
    expect(yearLabel(newYearsEve, 0)).toBe("2026")
  })
})

describe("requestNow", () => {
  it("is the real clock, read on demand", () => {
    const before = Date.now()
    const read = requestNow()
    expect(read).toBeGreaterThanOrEqual(before)
    expect(read).toBeLessThanOrEqual(Date.now())
  })
})

describe("seed", () => {
  it("is built relative to the instant it is given, never a fixed date", () => {
    const a = buildSeed(TODAY)
    const b = buildSeed(Date.parse("2027-03-01T15:00:00.000Z"))
    expect(a.map((i) => i.title)).toEqual(b.map((i) => i.title))
    expect(a.find((i) => i.title === "Flag Football 2026")!.window).toBe("Q4 2026")
    expect(b.find((i) => i.title === "Flag Football 2026")!.window).toBe("Q1 2027")
    expect(formatDate(a.find((i) => i.title === "Staff seats")!.signedAt)).toBe("1 Oct 2026")
    expect(formatDate(b.find((i) => i.title === "Staff seats")!.signedAt)).toBe("23 Feb 2027")
  })

  it("has eight bets across Now / Next / Later, all tagged sample, none signed in the future", () => {
    const seed = buildSeed(TODAY)
    expect(seed).toHaveLength(8)
    expect(seed.filter((i) => i.column === "now").map((i) => i.title)).toEqual([
      "Flag Football 2026", "Play share links", "iPad forced updates",
    ])
    expect(seed.filter((i) => i.column === "next").map((i) => i.title)).toEqual([
      "Web import from a link", "Staff seats", "CSV web import",
    ])
    expect(seed.filter((i) => i.column === "later").map((i) => i.title)).toEqual([
      "Auto-scout from film", "Parent recap emails",
    ])
    for (const i of seed) {
      expect(i.sample).toBe(true)
      expect(["Rashad", "Mace"]).toContain(i.owner)
      expect(Date.parse(i.signedAt)).toBeLessThanOrEqual(TODAY + 86_400_000)
      expect(i.updatedAt).toBe(i.signedAt)
      expect(i.window.length).toBeGreaterThan(0)
    }
    expect(seed.filter((i) => i.fromFeatureRequest).map((i) => i.title)).toEqual([
      "Play share links", "Web import from a link", "CSV web import",
      "Auto-scout from film", "Parent recap emails",
    ])
  })
})
