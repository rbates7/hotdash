import { describe, expect, it } from "vitest"

import { CENTRAL } from "@/lib/clock"
import { formatDay, formatRelative } from "@/lib/issues"

// 23:30 on Wednesday 7 Oct in Chicago is already Thursday 8 Oct in UTC.
const LATE_CT = "2026-10-08T04:30:00.000Z"

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

  it("formatRelative is arithmetic and does not depend on a zone", () => {
    const now = new Date(LATE_CT)
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000).toISOString(), now)).toBe("5m ago")
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000).toISOString(), now)).toBe("3h ago")
  })
})
