import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CENTRAL, daysBetween, formatDate } from "@/lib/clock"
import { LATE_EVENING_CT } from "@/test/clock"

type Dates = typeof import("@/lib/feature-requests/dates")

/** The shared formatter takes an instant and reads it in Central. */
const fmt = (iso: string) => formatDate(new Date(iso))
type Fixture = typeof import("@/lib/feature-requests/fixture")

// 10:00 in Chicago on 24 Aug 2026 (CDT, UTC−5).
const TODAY = new Date("2026-08-24T15:00:00.000Z")
// 23:30 CT on 7 Oct 2026: already 8 Oct in UTC (the shared late-evening instant).
const LATE = LATE_EVENING_CT

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

    it("at 23:30 CT reads the Central wall clock, not the UTC one", () => {
      expect(fmt(LATE.toISOString())).toBe("7 Oct 2026")
      expect(LATE.getUTCDate()).toBe(8)
      expect(dates.centralWall(LATE)).toEqual({ y: 2026, m: 10, d: 7, h: 23, min: 30, s: 0 })
    })

    it("calendarDaysBefore keeps the Central wall-clock time, and the shared day maths agree", () => {
      expect(dates.calendarDaysBefore(2, TODAY).toISOString()).toBe("2026-08-22T15:00:00.000Z")
      expect(dates.calendarDaysBefore(0, TODAY).toISOString()).toBe(TODAY.toISOString())
      // A day before 23:30 CT on 7 Oct is 23:30 CT on 6 Oct — still the 7th in UTC.
      const before = dates.calendarDaysBefore(1, LATE)
      expect(before.toISOString()).toBe("2026-10-07T04:30:00.000Z")
      expect(fmt(before.toISOString())).toBe("6 Oct 2026")
      expect(daysBetween(before, LATE)).toBe(1)
      expect(daysBetween(dates.calendarDaysBefore(46, TODAY), TODAY)).toBe(46)
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
        expect(daysBetween(before, from)).toBe(1)
      })

      it("spring forward: a day before 00:30 CDT on 9 Mar is 00:30 CST on 8 Mar", () => {
        const from = new Date("2026-03-09T05:30:00.000Z") // 00:30 CDT, 9 Mar
        const before = dates.calendarDaysBefore(1, from)
        expect(before.toISOString()).toBe("2026-03-08T06:30:00.000Z") // 00:30 CST, 8 Mar
        expect(fmt(before.toISOString())).toBe("8 Mar 2026")
        expect(fmt(new Date(from.getTime() - 86_400_000).toISOString())).toBe("7 Mar 2026")
        expect(daysBetween(before, from)).toBe(1)
      })

      it("the shared day maths counts the 25-hour day as one calendar day", () => {
        // 00:10 CDT on 1 Nov → 00:10 CST on 2 Nov is 25 hours, one day.
        expect(daysBetween(new Date("2026-11-01T05:10:00.000Z"), new Date("2026-11-02T06:10:00.000Z"))).toBe(1)
        // 23:50 CDT on 31 Oct → 00:10 CST on 2 Nov is 25h20m, two days.
        expect(daysBetween(new Date("2026-11-01T04:50:00.000Z"), new Date("2026-11-02T06:10:00.000Z"))).toBe(2)
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

      it("still dates today's card today when today is nearly over (23:30 CT)", () => {
        const seed = fixture.buildSeed(LATE)
        expect(fmt(seed[0].createdAt)).toBe("7 Oct 2026")
        expect(fmt(seed[1].createdAt)).toBe("5 Oct 2026")
        expect(fmt(seed[9].createdAt)).toBe("22 Aug 2026")
        for (const r of seed) expect(daysBetween(new Date(r.createdAt), LATE)).toBe(fixture.SEED_ROWS[seed.indexOf(r)].age)
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
