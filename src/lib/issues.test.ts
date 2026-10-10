import { describe, expect, it } from "vitest"

import { CENTRAL, formatRelative } from "@/lib/clock"
import { formatDay } from "@/lib/issues"
import { LATE_EVENING_CT } from "@/test/clock"

// 23:30 on Wednesday 7 Oct in Chicago is already Thursday 8 Oct in UTC.
const LATE_CT = LATE_EVENING_CT.toISOString()

describe("formatDay (M2)", () => {
  it("prints the day in Central time, so server and browser agree late at night", () => {
    expect(formatDay(LATE_CT)).toBe("Oct 7")
    // The bug: left to the runtime's zone, a UTC server says Oct 8.
    expect(formatDay(LATE_CT, "UTC")).toBe("Oct 8")
    expect(formatDay(LATE_CT, CENTRAL)).toBe(formatDay(LATE_CT))
  })

  it("is stable across the day in Central", () => {
    expect(formatDay("2026-10-07T05:00:00.000Z")).toBe("Oct 7") // 00:00 CT
    expect(formatDay("2026-10-07T18:00:00.000Z")).toBe("Oct 7") // 13:00 CT
    expect(formatDay("2026-10-08T04:59:00.000Z")).toBe("Oct 7") // 23:59 CT
    expect(formatDay("2026-10-08T05:00:00.000Z")).toBe("Oct 8") // 00:00 CT next day
  })

  it("formatRelative (ago style, the ticket view's) is arithmetic and does not depend on a zone — parity with the passed copy", () => {
    const now = new Date(LATE_CT)
    const ago = (ms: number) => formatRelative(now.getTime() - ms, now.getTime(), { style: "ago" })
    expect(ago(5 * 60_000)).toBe("5m ago")
    expect(ago(3 * 3_600_000)).toBe("3h ago")
    expect(ago(2 * 3_600_000)).toBe("2h ago")
    expect(ago(26 * 3_600_000)).toBe("1d ago")
    expect(ago(20_000)).toBe("just now")
  })
})
