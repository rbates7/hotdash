import { describe, expect, it } from "vitest"

import {
  FR_BOARD_DESKTOP,
  FR_BOARD_PHONE,
  FR_BOARD_TABLET,
  FR_CHIP,
  FR_CHIPS,
  FR_DESKTOP_NEW_IDEA,
  FR_HEADER,
  FR_HEADER_ACTIONS,
  FR_INPUT,
  FR_PHONE_NEW_IDEA,
  FR_RESET,
  FR_ROADMAP_HINT,
  FR_SHEET,
  FR_TOUCH,
} from "@/components/feature-request/responsive"

describe("Feature Request responsive layout", () => {
  it("keeps the desktop header row and grows Reset / New idea below xl", () => {
    expect(FR_HEADER).toContain("flex-wrap")
    expect(FR_HEADER).toContain("justify-between")
    expect(FR_HEADER_ACTIONS).toContain("max-md:w-full")
    expect(FR_PHONE_NEW_IDEA).toContain("md:hidden")
    expect(FR_DESKTOP_NEW_IDEA).toContain("max-md:hidden")
    expect(FR_RESET).toBe("max-xl:h-11! max-xl:px-2.5!")
    expect(FR_TOUCH).toContain("max-xl:h-11!")
    expect(FR_TOUCH).toContain("max-xl:min-w-11!")
  })

  it("uses chips + one column on phone, 2×2 on tablet portrait, four columns on desktop", () => {
    expect(FR_CHIPS).toContain("overflow-x-auto")
    expect(FR_CHIP).toContain("h-11")
    expect(FR_CHIP).toContain("rounded-full")
    expect(FR_BOARD_PHONE).toContain("flex-col")
    expect(FR_BOARD_TABLET).toContain("grid-cols-2")
    expect(FR_BOARD_DESKTOP).toContain("grid-cols-4")
  })

  it("docks the idea dialog as a bottom sheet on phone and grows the Roadmap hint", () => {
    expect(FR_SHEET).toContain("max-md:bottom-0!")
    expect(FR_SHEET).toContain("max-md:translate-y-0!")
    expect(FR_SHEET).toContain("max-md:rounded-t-2xl!")
    expect(FR_INPUT).toContain("max-xl:min-h-11")
    expect(FR_INPUT).toContain("max-xl:text-base")
    expect(FR_ROADMAP_HINT).toContain("max-xl:min-h-11")
    expect(FR_ROADMAP_HINT).toContain("max-xl:basis-full")
  })
})
