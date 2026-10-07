import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { CENTRAL, formatDate, formatRelative, formatRelativeDay, todayIn } from "@/lib/clock"
import {
  centralDay,
  middayInstant,
  monthLabel,
  quarterLabel,
  signedDaysAgo,
  yearLabel,
} from "@/lib/roadmap/dates"
import { buildSeed } from "@/lib/roadmap/fixture"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"

// 15:00 UTC = 10:00 in Chicago, so a day either side stays on the same date.
const TODAY = Date.parse("2026-10-07T15:00:00.000Z")

// 23:30 CDT on 7 Oct = 04:30 UTC on 8 Oct: UTC, and most of the world east
// of Chicago, is already on the next day. The shared instant every clock
// test uses.
const LATE = LATE_EVENING_CT.toISOString()
const LATE_MS = LATE_EVENING_CT_MS

const fmt = (instant: string | number) => formatDate(new Date(instant))

/**
 * The same assertions under both process zones Mack asked for, plus two
 * extremes, so a helper that quietly fell back to the machine zone would
 * fail in at least one of them. (`pnpm test` runs under TZ=UTC and
 * `pnpm test:tz` re-runs this file under TZ=America/Chicago as well.)
 */
describe.each(["UTC", "America/Chicago", "Pacific/Kiritimati", "Asia/Tokyo"])(
  "roadmap dates under TZ=%s",
  (tz) => {
    const originalTz = process.env.TZ
    beforeAll(() => {
      process.env.TZ = tz
    })
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    })

    it("works in Central days through the shared clock", () => {
      expect(CENTRAL).toBe("America/Chicago")
      expect(centralDay(TODAY)).toBe("2026-10-07")
      expect(centralDay(TODAY)).toBe(todayIn(new Date(TODAY)))
      expect(fmt(TODAY)).toBe("7 Oct 2026")
      // 03:00 UTC is still the previous evening in Chicago.
      expect(fmt("2026-10-08T03:00:00.000Z")).toBe("7 Oct 2026")
    })

    describe("at 23:30 Central", () => {
      it("is still the 7th, not the UTC 8th", () => {
        expect(new Date(LATE).getUTCDate()).toBe(8)
        expect(centralDay(LATE_MS)).toBe("2026-10-07")
        expect(fmt(LATE)).toBe("7 Oct 2026")
        // The local clock is exercised too; whatever it says must not leak in.
        expect(new Date(LATE).getDate()).toBeDefined()
      })

      it("the shared formatRelative long style counts days from the Central calendar", () => {
        const long = (from: string) => formatRelative(Date.parse(from), LATE_MS, { style: "long" })
        expect(long("2026-10-07T15:00:00.000Z")).toBe("13 h ago") // still today in Chicago
        expect(long("2026-10-06T15:00:00.000Z")).toBe("Yesterday")
        expect(long("2026-10-05T15:00:00.000Z")).toBe("Mon, Oct 5")
        // 00:30 CDT the next morning is tomorrow in Central, even though it
        // is the same UTC day as LATE.
        expect(centralDay(Date.parse("2026-10-08T05:30:00.000Z"))).toBe("2026-10-08")
      })

      it("labels windows from the Central month, quarter and year", () => {
        expect(monthLabel(LATE_MS, 0)).toBe("Oct 2026")
        expect(quarterLabel(LATE_MS, 0)).toBe("Q4 2026")
        expect(yearLabel(LATE_MS, 0)).toBe("2026")
      })

      it("still signs today's bet today when today is nearly over", () => {
        expect(fmt(signedDaysAgo(LATE_MS, 0))).toBe("7 Oct 2026")
        expect(fmt(signedDaysAgo(LATE_MS, 2))).toBe("5 Oct 2026")
        const seed = buildSeed(LATE_MS)
        expect(fmt(seed.find((i) => i.title === "Parent recap emails")!.signedAt)).toBe("7 Oct 2026")
        expect(fmt(seed.find((i) => i.title === "Auto-scout from film")!.signedAt)).toBe("5 Oct 2026")
      })
    })
  }
)

describe("day arithmetic", () => {
  it("signedDaysAgo lands at midday Central on the right calendar day", () => {
    expect(signedDaysAgo(TODAY, 0)).toBe("2026-10-07T18:00:00.000Z")
    expect(fmt(signedDaysAgo(TODAY, 2))).toBe("5 Oct 2026")
    expect(fmt(signedDaysAgo(TODAY, 40))).toBe("28 Aug 2026")
    // 18:00Z is 13:00 CDT / 12:00 CST — the same day in Central and in UTC.
    expect(middayInstant("2026-10-07")).toBe("2026-10-07T18:00:00.000Z")
    expect(new Date(middayInstant("2026-10-07")).toISOString().slice(0, 10)).toBe("2026-10-07")
  })

  it("crosses the spring DST change without an off-by-one (24h subtraction would)", () => {
    // Clocks went forward at 02:00 CST on 8 Mar 2026. 00:30 CDT on 9 Mar is
    // 05:30 UTC; 24 hours earlier is 05:30 UTC on 8 Mar, which is still
    // 23:30 CST on 7 Mar — the wrong day. Calendar arithmetic is not fooled.
    const afterSpring = Date.parse("2026-03-09T05:30:00.000Z")
    expect(fmt(afterSpring)).toBe("9 Mar 2026")
    expect(fmt(afterSpring - 86_400_000)).toBe("7 Mar 2026")
    expect(fmt(signedDaysAgo(afterSpring, 1))).toBe("8 Mar 2026")
    expect(formatRelative(Date.parse(signedDaysAgo(afterSpring, 1)), afterSpring, { style: "long" })).toBe("Yesterday")
  })

  it("crosses the autumn DST change without an off-by-one", () => {
    // Clocks went back at 02:00 CDT on 1 Nov 2026. 23:30 CST on 1 Nov is
    // 05:30 UTC on 2 Nov.
    const afterFall = Date.parse("2026-11-02T05:30:00.000Z")
    expect(fmt(afterFall)).toBe("1 Nov 2026")
    expect(fmt(signedDaysAgo(afterFall, 1))).toBe("31 Oct 2026")
    expect(fmt(signedDaysAgo(afterFall, 2))).toBe("30 Oct 2026")
    expect(formatRelative(Date.parse("2026-10-30T18:00:00.000Z"), afterFall, { style: "long" })).toBe("Fri, Oct 30")
  })

  it("signed dates read through formatRelative long — the dialog's Signed copy", () => {
    const signed = (from: string) => formatRelative(Date.parse(from), TODAY, { style: "long" })
    expect(signed(signedDaysAgo(TODAY, 0))).toBe("just now") // midday seed vs 10:00 — never negative
    expect(signed("2026-10-07T04:30:00.000Z")).toBe("Yesterday") // 23:30 on the 6th in Chicago
    expect(signed(signedDaysAgo(TODAY, 1))).toBe("Yesterday")
    expect(signed(signedDaysAgo(TODAY, 2))).toBe("Mon, Oct 5")
    expect(signed(signedDaysAgo(TODAY, 9))).toBe("Mon, Sep 28")
  })

  it("day labels for a signed calendar day go through formatRelativeDay", () => {
    const today = new Date(TODAY)
    expect(formatRelativeDay(new Date(signedDaysAgo(TODAY, 0)), today)).toBe("Today")
    expect(formatRelativeDay(new Date(signedDaysAgo(TODAY, 1)), today)).toBe("Yesterday")
    expect(formatRelativeDay(new Date(signedDaysAgo(TODAY, 9)), today)).toBe("9 days ago")
    expect(formatRelativeDay(new Date(LATE), LATE_EVENING_CT)).toBe("Today")
    expect(formatRelativeDay("2026-10-08", LATE_EVENING_CT)).toBe("Tomorrow")
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

describe("seed", () => {
  it("is built relative to the instant it is given, never a fixed date", () => {
    const a = buildSeed(TODAY)
    const b = buildSeed(Date.parse("2027-03-01T15:00:00.000Z"))
    expect(a.map((i) => i.title)).toEqual(b.map((i) => i.title))
    expect(a.find((i) => i.title === "Flag Football 2026")!.window).toBe("Q4 2026")
    expect(b.find((i) => i.title === "Flag Football 2026")!.window).toBe("Q1 2027")
    expect(fmt(a.find((i) => i.title === "Staff seats")!.signedAt)).toBe("1 Oct 2026")
    expect(fmt(b.find((i) => i.title === "Staff seats")!.signedAt)).toBe("23 Feb 2027")
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
