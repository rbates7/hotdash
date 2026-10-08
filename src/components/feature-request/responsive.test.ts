import { describe, expect, it } from "vitest"

import {
  FR_BOARD_DESKTOP,
  FR_BOARD_PHONE,
  FR_BOARD_TABLET,
  FR_CHIP,
  FR_CHIP_COUNT,
  FR_CHIP_ON,
  FR_CHIPS,
  FR_CHIPS_FADE,
  FR_CHIPS_WRAP,
  FR_CONFIRM_DELETE,
  FR_DESKTOP_NEW_IDEA,
  FR_HEADER,
  FR_HEADER_ACTIONS,
  FR_ICON,
  FR_INPUT,
  FR_PHONE_NEW_IDEA,
  FR_PRESSED,
  FR_RESET,
  FR_ROADMAP_HINT,
  FR_SHEET,
  FR_TEXTAREA,
  FR_TITLE,
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
    expect(FR_TOUCH).toContain("max-xl:h-12!")
    expect(FR_TOUCH).toContain("max-xl:min-h-12!")
    expect(FR_TOUCH).toContain("max-xl:min-w-11!")
    expect(FR_ICON).toBe("max-xl:size-11!")
  })

  it("uses chips + one column on phone, 2×2 on tablet portrait, four columns on desktop", () => {
    expect(FR_CHIPS).toContain("overflow-x-auto")
    expect(FR_CHIPS_WRAP).toContain("relative")
    expect(FR_CHIPS_FADE).toContain("from-background")
    expect(FR_CHIPS_FADE).toContain("bg-gradient-to-l")
    expect(FR_CHIP).toContain("h-11")
    expect(FR_CHIP).toContain("rounded-full")
    expect(FR_CHIP).toContain("px-2.5")
    expect(FR_CHIP_COUNT).not.toContain("min-w-")
    expect(FR_PRESSED).toContain("aria-pressed:bg-primary!")
    expect(FR_PRESSED).toContain("aria-pressed:text-primary-foreground!")
    expect(FR_CHIP_ON).toBe(FR_PRESSED)
    expect(FR_BOARD_PHONE).toContain("flex-col")
    expect(FR_BOARD_TABLET).toContain("grid-cols-2")
    expect(FR_BOARD_DESKTOP).toContain("grid-cols-4")
  })

  it("scopes sheet, ask, title, and confirm-delete overrides to below 1280", () => {
    expect(FR_SHEET).toContain("max-md:bottom-0!")
    expect(FR_SHEET).toContain("max-md:translate-y-0!")
    expect(FR_SHEET).toContain("max-md:rounded-t-2xl!")
    expect(FR_SHEET).toContain("max-md:max-w-none!")
    expect(FR_SHEET).toContain("max-md:m-0!")
    expect(FR_SHEET).toContain("max-md:data-open:zoom-in-100")
    expect(FR_INPUT).toContain("max-xl:min-h-12!")
    expect(FR_INPUT).toContain("max-xl:text-base")
    expect(FR_TITLE).toContain("max-xl:min-h-12!")
    expect(FR_TITLE).not.toContain("text-base")
    expect(FR_TEXTAREA).toContain("max-xl:field-sizing-content")
    expect(FR_TEXTAREA).toContain("max-xl:min-h-24!")
    expect(FR_TEXTAREA).not.toMatch(/(?:^|\s)field-sizing-content/)
    expect(FR_TEXTAREA).not.toMatch(/(?:^|\s)min-h-/)
    expect(FR_TEXTAREA).not.toMatch(/(?:^|\s)h-/)
    expect(FR_CONFIRM_DELETE).toContain("max-xl:text-danger-text!")
    expect(FR_CONFIRM_DELETE).toContain("max-xl:bg-transparent!")
    expect(FR_ROADMAP_HINT).toContain("rounded-full")
    expect(FR_ROADMAP_HINT).toContain("max-xl:text-foreground")
    expect(FR_ROADMAP_HINT).not.toContain("basis-full")
    expect(FR_ROADMAP_HINT).not.toContain("min-h-11")
  })
})
