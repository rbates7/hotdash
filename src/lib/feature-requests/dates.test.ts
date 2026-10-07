import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CENTRAL, formatDate } from "@/lib/clock"

type Dates = typeof import("@/lib/feature-requests/dates")

/** The shared formatter takes an instant and reads it in Central. */
const fmt = (iso: string) => formatDate(new Date(iso))
type Fixture = typeof import("@/lib/feature-requests/fixture")

// 10:00 in Chicago on 24 Aug 2026 (CDT, UTC−5).
const TODAY = new Date("2026-08-24T15:00:00.000Z")
// 23:30 CDT on 24 Aug = 04:30 UTC on 25 Aug: UTC, and most of the world east
// of Chicago, is already on the next day.
const LATE = new Date("2026-08-25T04:30:00.000Z")

const originalTz = process.env.TZ

/**
 * Every assertion runs with the process in UTC and again in Central, with
 * the module re-imported each time so its lazily built formatter cannot
 * carry state across zones. The helpers pass `timeZone: CENTRAL` explicitly,
 * so both runs must agree exactly.
 */
for (const tz of ["UTC", "America/Chicago"]) {
  describe(`dates (process TZ=${tz})`, () => {
    let dates: Dates
    let fixture: Fixture

    beforeEach(async () => {
      process.env.TZ = tz
      vi.resetModules()
      dates = await import("@/lib/feature-requests/dates")
      fixture = await import("@/lib/feature-requests/fixture")
    })
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    })

    it("the shared formatter prints the mock's form, in Central time", () => {
      expect(CENTRAL).toBe("America/Chicago")
      expect(fmt("2026-08-24T15:00:00.000Z")).toBe("24 Aug 2026")
      expect(fmt("2026-07-09T15:00:00.000Z")).toBe("9 Jul 2026")
      expect(fmt("2026-09-11T15:00:00.000Z")).toBe("11 Sep 2026")
      // 03:00 UTC is still the previous evening in Chicago.
      expect(fmt("2026-08-25T03:00:00.000Z")).toBe("24 Aug 2026")
    })

    it("at 23:30 CT prints the Central date, not the UTC one", () => {
      expect(fmt(LATE.toISOString())).toBe("24 Aug 2026")
      expect(LATE.getUTCDate()).toBe(25)
      expect(dates.centralWall(LATE)).toEqual({ y: 2026, m: 8, d: 24, h: 23, min: 30, s: 0 })
    })

    it("counts Central calendar days, not 24-hour blocks", () => {
      expect(dates.calendarDaysAgo("2026-08-24T04:30:00.000Z", TODAY)).toBe(1) // 23:30 on the 23rd
      expect(dates.calendarDaysAgo("2026-08-24T14:00:00.000Z", TODAY)).toBe(0)
      expect(dates.calendarDaysAgo("2026-08-22T15:00:00.000Z", TODAY)).toBe(2)
      // At 23:30 CT, 00:30 CT the next morning is tomorrow even though it is
      // the same UTC day.
      expect(dates.calendarDaysAgo("2026-08-25T05:30:00.000Z", LATE)).toBe(-1)
      expect(dates.calendarDaysAgo("2026-08-24T15:00:00.000Z", LATE)).toBe(0)
    })

    it("labels relative age in plain words", () => {
      const ago = (n: number) => dates.calendarDaysBefore(n, TODAY).toISOString()
      expect(dates.relativeLabel(ago(0), TODAY)).toBe("today")
      expect(dates.relativeLabel(ago(1), TODAY)).toBe("yesterday")
      expect(dates.relativeLabel(ago(5), TODAY)).toBe("5 days ago")
      expect(dates.relativeLabel(ago(13), TODAY)).toBe("13 days ago")
      expect(dates.relativeLabel(ago(20), TODAY)).toBe("2 weeks ago")
      expect(dates.relativeLabel(ago(46), TODAY)).toBe("6 weeks ago")
      expect(dates.relativeLabel(ago(95), TODAY)).toBe("3 months ago")
      expect(dates.relativeLabel("2026-08-23T15:00:00.000Z", LATE)).toBe("yesterday")
    })

    it("calendarDaysBefore keeps the Central wall-clock time", () => {
      expect(dates.calendarDaysBefore(2, TODAY).toISOString()).toBe("2026-08-22T15:00:00.000Z")
      expect(dates.calendarDaysBefore(0, TODAY).toISOString()).toBe(TODAY.toISOString())
      expect(dates.calendarDaysBefore(1, LATE).toISOString()).toBe("2026-08-24T04:30:00.000Z")
    })

    describe("across DST", () => {
      // US clocks fall back on 1 Nov 2026 and spring forward on 8 Mar 2026.
      it("fall back: a day before 23:30 CST on 1 Nov is 23:30 CDT on 31 Oct", () => {
        const from = new Date("2026-11-02T05:30:00.000Z") // 23:30 CST, 1 Nov
        const before = dates.calendarDaysBefore(1, from)
        expect(before.toISOString()).toBe("2026-11-01T04:30:00.000Z") // 23:30 CDT, 31 Oct
        expect(fmt(before.toISOString())).toBe("31 Oct 2026")
        // 24-hour maths would have landed on 00:30 CDT 1 Nov — the wrong day.
        expect(fmt(new Date(from.getTime() - 86_400_000).toISOString())).toBe("1 Nov 2026")
        expect(dates.calendarDaysAgo(before.toISOString(), from)).toBe(1)
      })

      it("spring forward: a day before 00:30 CDT on 9 Mar is 00:30 CST on 8 Mar", () => {
        const from = new Date("2026-03-09T05:30:00.000Z") // 00:30 CDT, 9 Mar
        const before = dates.calendarDaysBefore(1, from)
        expect(before.toISOString()).toBe("2026-03-08T06:30:00.000Z") // 00:30 CST, 8 Mar
        expect(fmt(before.toISOString())).toBe("8 Mar 2026")
        expect(fmt(new Date(from.getTime() - 86_400_000).toISOString())).toBe("7 Mar 2026")
        expect(dates.calendarDaysAgo(before.toISOString(), from)).toBe(1)
      })

      it("counts the 25-hour day as one calendar day", () => {
        // 00:10 CDT on 1 Nov → 00:10 CST on 2 Nov is 25 hours, one day.
        expect(dates.calendarDaysAgo("2026-11-01T05:10:00.000Z", new Date("2026-11-02T06:10:00.000Z"))).toBe(1)
        // 23:50 CDT on 31 Oct → 00:10 CST on 2 Nov is 25h20m, two days.
        expect(dates.calendarDaysAgo("2026-11-01T04:50:00.000Z", new Date("2026-11-02T06:10:00.000Z"))).toBe(2)
      })

      it("round-trips any Central wall time, including overflowed days", () => {
        const w = dates.centralWall(TODAY)
        expect(dates.instantAtCentralWall(w).toISOString()).toBe(TODAY.toISOString())
        expect(dates.instantAtCentralWall({ ...w, d: w.d - 30 }).toISOString()).toBe("2026-07-25T15:00:00.000Z")
        expect(dates.instantAtCentralWall({ ...w, d: w.d - 100 }).toISOString()).toBe("2026-05-16T15:00:00.000Z")
      })
    })

    describe("seed", () => {
      it("is generated relative to the instant it is given, never a fixed date", () => {
        const a = fixture.buildSeed(TODAY)
        const b = fixture.buildSeed(new Date("2027-03-01T15:00:00.000Z"))
        expect(a[0].createdAt).toBe(TODAY.toISOString())
        expect(b[0].createdAt).toBe("2027-03-01T15:00:00.000Z")
        expect(a.map((r) => r.title)).toEqual(b.map((r) => r.title))
      })

      it("reproduces the mock's dates when today is 24 Aug 2026", () => {
        expect(fixture.buildSeed(TODAY).map((r) => fmt(r.createdAt))).toEqual([
          "24 Aug 2026", "22 Aug 2026", "19 Aug 2026",
          "14 Aug 2026", "11 Aug 2026", "4 Aug 2026",
          "29 Jul 2026", "22 Jul 2026",
          "18 Jul 2026", "9 Jul 2026",
        ])
      })

      it("still dates today's card today when today is nearly over", () => {
        const seed = fixture.buildSeed(LATE)
        expect(fmt(seed[0].createdAt)).toBe("24 Aug 2026")
        expect(fmt(seed[1].createdAt)).toBe("22 Aug 2026")
      })

      it("has ten cards, all from Dan, all tagged as sample data, none in the future", () => {
        const seed = fixture.buildSeed(TODAY)
        expect(seed).toHaveLength(10)
        expect(fixture.SEED_ROWS).toHaveLength(10)
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
  })
}
