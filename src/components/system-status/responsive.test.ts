import { describe, expect, it } from "vitest"

import {
  STATUS_BANNER,
  STATUS_BANNER_META,
  STATUS_HEADER,
  STATUS_HEADER_META,
  STATUS_INCIDENT,
  STATUS_PREVIEW,
  STATUS_PREVIEW_OPTION,
  STATUS_ROW,
  STATUS_ROW_LINK,
} from "@/components/system-status/responsive"

describe("System Status responsive layout", () => {
  it("stacks the header on phone and restores the desktop row from md", () => {
    expect(STATUS_HEADER).toContain("flex-col")
    expect(STATUS_HEADER).toContain("md:flex-row")
    expect(STATUS_HEADER).toContain("md:justify-between")
  })

  it("makes the preview full-width and 44px below xl, and h-8 on desktop", () => {
    expect(STATUS_PREVIEW).toContain("max-md:w-full")
    expect(STATUS_PREVIEW).toContain("xl:h-8")
    expect(STATUS_PREVIEW_OPTION).toContain("max-xl:min-h-11")
    expect(STATUS_PREVIEW_OPTION).toContain("max-md:flex-1")
    expect(STATUS_PREVIEW_OPTION).toContain("max-md:justify-center")
    expect(STATUS_PREVIEW_OPTION).toContain("whitespace-nowrap")
    expect(STATUS_PREVIEW_OPTION).not.toContain("max-xl:flex-1")
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
