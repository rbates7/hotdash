import { describe, expect, it } from "vitest"

import { formatClock, nextRun, nextRunLabel } from "@/lib/autopilots"
import { autopilots } from "@/lib/workplace-fixture"
import { FIXED_NOW } from "@/test/clock"

// FIXED_NOW is Thursday 27 Aug 2026, 09:00 Central.
const THU_9AM = FIXED_NOW
const THU_7AM = new Date("2026-08-27T12:00:00Z")
const MON_8AM = new Date("2026-08-31T13:00:00Z")
const MON_10AM = new Date("2026-08-31T15:00:00Z")
const THU_11PM = new Date("2026-08-28T04:00:00Z")

describe("nextRun", () => {
  it("daily: later today if the hour has not passed, else tomorrow", () => {
    expect(nextRun({ kind: "daily", hour: 8 }, THU_7AM)).toEqual({ daysAhead: 0, hour: 8, minute: 0 })
    expect(nextRun({ kind: "daily", hour: 8 }, THU_9AM)).toEqual({ daysAhead: 1, hour: 8, minute: 0 })
  })

  it("weekly: counts calendar days to the weekday in Central time", () => {
    const monday = { kind: "weekly", weekday: 1, hour: 9 } as const
    expect(nextRun(monday, THU_9AM).daysAhead).toBe(4)
    expect(nextRun(monday, MON_8AM).daysAhead).toBe(0)
    expect(nextRun(monday, MON_10AM).daysAhead).toBe(7)
  })

  it("every N hours: next multiple of the interval from midnight, rolling over", () => {
    expect(nextRun({ kind: "every-hours", hours: 6 }, THU_9AM)).toEqual({ daysAhead: 0, hour: 12, minute: 0 })
    expect(nextRun({ kind: "every-hours", hours: 6 }, THU_11PM)).toEqual({ daysAhead: 1, hour: 0, minute: 0 })
  })
})

describe("nextRunLabel", () => {
  it("writes Today / Tomorrow / a dated weekday with a Central clock", () => {
    expect(nextRunLabel({ kind: "daily", hour: 8 }, THU_7AM)).toBe("Today · 8:00am CT")
    expect(nextRunLabel({ kind: "daily", hour: 8 }, THU_9AM)).toBe("Tomorrow · 8:00am CT")
    expect(nextRunLabel({ kind: "weekly", weekday: 1, hour: 9 }, THU_9AM)).toBe("Mon 31 Aug · 9:00am CT")
    expect(nextRunLabel({ kind: "every-hours", hours: 6 }, THU_11PM)).toBe("Tomorrow · 12:00am CT")
  })

  it("every fixture autopilot resolves on any day", () => {
    for (const at of [THU_9AM, MON_8AM, new Date("2027-01-01T05:59:00Z")]) {
      for (const ap of autopilots) {
        expect(nextRunLabel(ap.schedule, at)).toMatch(/^(Today|Tomorrow|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}) · \d{1,2}:\d{2}(am|pm) CT$/)
      }
    }
  })
})

describe("formatClock", () => {
  it("is 12-hour with am/pm", () => {
    expect(formatClock(0, 0)).toBe("12:00am")
    expect(formatClock(8, 5)).toBe("8:05am")
    expect(formatClock(12, 0)).toBe("12:00pm")
    expect(formatClock(18, 30)).toBe("6:30pm")
  })
})
