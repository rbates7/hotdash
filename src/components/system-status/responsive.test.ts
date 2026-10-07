import { describe, expect, it } from "vitest"

import {
  STATUS_BANNER,
  STATUS_HEADER,
  STATUS_INCIDENT,
  STATUS_PREVIEW,
  STATUS_PREVIEW_OPTION,
  STATUS_ROW,
} from "@/components/system-status/responsive"

describe("System Status responsive layout", () => {
  it("stacks the header on phone and restores the desktop row from md", () => {
    expect(STATUS_HEADER).toContain("flex-col")
    expect(STATUS_HEADER).toContain("md:flex-row")
    expect(STATUS_HEADER).toContain("md:justify-between")
  })

  it("makes the preview full-width and 44px below xl, and h-8 on desktop", () => {
    expect(STATUS_PREVIEW).toContain("max-md:w-full")
    expect(STATUS_PREVIEW).toContain("max-xl:h-11")
    expect(STATUS_PREVIEW).toContain("xl:h-8")
    expect(STATUS_PREVIEW_OPTION).toContain("max-xl:min-h-10")
    expect(STATUS_PREVIEW_OPTION).toContain("max-xl:flex-1")
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
