import { describe, expect, it } from "vitest"

import { formatDate, formatDuration } from "./format"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatDuration", () => {
  it("picks the biggest unit that fits", () => {
    expect(formatDuration(0)).toBe("<1m")
    expect(formatDuration(12 * MINUTE)).toBe("12m")
    expect(formatDuration(5 * HOUR + 30 * MINUTE)).toBe("5h")
    expect(formatDuration(3 * DAY + 23 * HOUR)).toBe("3d")
    expect(formatDuration(75 * DAY)).toBe("2mo")
  })
})

describe("formatDate", () => {
  it("drops the year while it is this year", () => {
    const now = Date.UTC(2026, 8, 2, 12)
    expect(formatDate(new Date(Date.UTC(2026, 5, 3, 12)), now)).toMatch(/Jun 3$/)
    expect(formatDate(new Date(Date.UTC(2025, 5, 3, 12)), now)).toMatch(/2025/)
  })
})
