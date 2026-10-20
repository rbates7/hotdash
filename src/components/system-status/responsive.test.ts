import { describe, expect, it } from "vitest"

import {
  STATUS_BANNER,
  STATUS_BANNER_META,
  STATUS_HEADER,
  STATUS_HEADER_META,
  STATUS_INCIDENT,
  STATUS_ROW,
  STATUS_ROW_LINK,
} from "@/components/system-status/responsive"

describe("System Status responsive layout", () => {
  it("stacks the header on phone and restores the desktop row from md", () => {
    expect(STATUS_HEADER).toContain("flex-col")
    expect(STATUS_HEADER).toContain("md:flex-row")
    expect(STATUS_HEADER).toContain("md:justify-between")
  })

  it("stacks the header meta on phone and keeps the row links 44px there", () => {
    expect(STATUS_HEADER_META).toContain("max-md:items-start")
    expect(STATUS_BANNER_META).toContain("max-md:pl-10")
    expect(STATUS_BANNER_META).not.toContain("pl-11")
    expect(STATUS_ROW_LINK).toBe("max-md:min-h-11")
  })

  it("stacks the banner and service rows on phone only", () => {
    expect(STATUS_BANNER).toContain("flex-col")
    expect(STATUS_BANNER).toContain("md:flex-row")
    expect(STATUS_ROW).toContain("grid-template-areas:'name_status'_'reason_reason'_'time_time'")
    expect(STATUS_ROW).toContain("md:[grid-template-areas:'name_status'_'reason_time']")
    expect(STATUS_INCIDENT).toContain("flex-col")
    expect(STATUS_INCIDENT).toContain("md:flex-row")
  })
})
