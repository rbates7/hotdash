import { describe, expect, it } from "vitest"

import {
  ROADMAP_BOARD_DESKTOP,
  ROADMAP_BOARD_PHONE,
  ROADMAP_BOARD_TABLET,
  ROADMAP_CARD_EDIT,
  ROADMAP_CARD_TOOLBAR,
  ROADMAP_CONFIRM_DELETE,
  ROADMAP_DELETE,
  ROADMAP_DESKTOP_NEW_BET,
  ROADMAP_HEADER,
  ROADMAP_HEADER_ACTIONS,
  ROADMAP_ICON,
  ROADMAP_INPUT,
  ROADMAP_OPTION,
  ROADMAP_PHONE_NEW_BET,
  ROADMAP_COMPACT_BOARD_QUERY,
  ROADMAP_PRESSED,
  ROADMAP_RESET,
  ROADMAP_THREE_COL_MIN,
  ROADMAP_SEGMENT,
  ROADMAP_SHEET,
  ROADMAP_SWITCHER,
  ROADMAP_TEXTAREA,
  ROADMAP_TITLE,
  ROADMAP_TOUCH,
} from "@/components/product-roadmap/responsive"

describe("Product Roadmap responsive layout", () => {
  it("keeps the desktop header row and grows Reset / New bet below xl", () => {
    expect(ROADMAP_HEADER).toContain("flex-wrap")
    expect(ROADMAP_HEADER).toContain("justify-between")
    expect(ROADMAP_HEADER_ACTIONS).toContain("max-md:w-full")
    expect(ROADMAP_HEADER_ACTIONS).toContain("max-md:flex-wrap")
    expect(ROADMAP_HEADER_ACTIONS).not.toMatch(/(?:^|\s)flex-wrap/)
    expect(ROADMAP_PHONE_NEW_BET).toContain("md:hidden")
    expect(ROADMAP_DESKTOP_NEW_BET).toContain("max-md:hidden")
    expect(ROADMAP_RESET).toBe("max-xl:h-11! max-xl:min-w-11!")
    expect(ROADMAP_TOUCH).toContain("max-xl:h-12!")
    expect(ROADMAP_TOUCH).toContain("max-xl:min-h-12!")
    expect(ROADMAP_TOUCH).toContain("max-xl:min-w-11!")
    expect(ROADMAP_ICON).toBe("max-xl:size-11!")
  })

  it("uses equal segments + one column on phone, 2-col below 1180, three columns at ≥1180", () => {
    expect(ROADMAP_SWITCHER).toContain("h-12")
    expect(ROADMAP_SWITCHER).toContain("w-full")
    expect(ROADMAP_SWITCHER).not.toContain("overflow-x-auto")
    expect(ROADMAP_SEGMENT).toContain("flex-1")
    expect(ROADMAP_SEGMENT).toContain("h-11")
    expect(ROADMAP_PRESSED).toContain("aria-pressed:bg-primary!")
    expect(ROADMAP_PRESSED).toContain("aria-pressed:text-primary-foreground!")
    expect(ROADMAP_PRESSED).toContain("aria-pressed:border-primary!")
    expect(ROADMAP_PRESSED).not.toContain("max-xl:")
    expect(ROADMAP_THREE_COL_MIN).toBe(1180)
    expect(ROADMAP_COMPACT_BOARD_QUERY).toBe("(min-width: 768px) and (max-width: 1179px)")
    expect(ROADMAP_BOARD_PHONE).toContain("flex-col")
    expect(ROADMAP_BOARD_TABLET).toContain("grid-cols-2")
    expect(ROADMAP_BOARD_DESKTOP).toContain("grid-cols-3")
  })

  it("scopes sheet, why, title, and confirm-delete overrides to below 1280", () => {
    expect(ROADMAP_SHEET).toContain("max-md:bottom-0!")
    expect(ROADMAP_SHEET).toContain("max-md:translate-y-0!")
    expect(ROADMAP_SHEET).toContain("max-md:rounded-t-2xl!")
    expect(ROADMAP_SHEET).toContain("max-md:max-w-none!")
    expect(ROADMAP_SHEET).toContain("max-md:m-0!")
    expect(ROADMAP_SHEET).toContain("max-md:data-open:zoom-in-100")
    expect(ROADMAP_INPUT).toContain("max-xl:min-h-12!")
    expect(ROADMAP_INPUT).toContain("max-xl:text-base")
    expect(ROADMAP_TITLE).toContain("max-xl:min-h-12!")
    expect(ROADMAP_TITLE).not.toContain("text-base")
    expect(ROADMAP_TEXTAREA).toContain("max-xl:field-sizing-content")
    expect(ROADMAP_TEXTAREA).toContain("max-xl:min-h-24!")
    expect(ROADMAP_TEXTAREA).not.toMatch(/(?:^|\s)field-sizing-content/)
    expect(ROADMAP_TEXTAREA).not.toMatch(/(?:^|\s)min-h-/)
    expect(ROADMAP_TEXTAREA).not.toMatch(/(?:^|\s)h-/)
    expect(ROADMAP_CONFIRM_DELETE).toBe("max-xl:text-danger-text!")
    expect(ROADMAP_CONFIRM_DELETE).not.toContain("bg-transparent")
    expect(ROADMAP_DELETE).toContain("text-destructive")
    expect(ROADMAP_DELETE).toContain("max-xl:text-danger-text!")
    expect(ROADMAP_OPTION).toContain("max-xl:min-h-12!")
    expect(ROADMAP_CARD_EDIT).toContain("h-6")
    expect(ROADMAP_CARD_EDIT).toContain("px-1.5")
    expect(ROADMAP_CARD_EDIT).toContain("max-xl:h-11!")
    expect(ROADMAP_CARD_EDIT).toContain("max-xl:px-3!")
    expect(ROADMAP_CARD_EDIT).toContain("min-[1180px]:max-xl:px-2!")
    expect(ROADMAP_CARD_TOOLBAR).toContain("gap-0.5")
    expect(ROADMAP_CARD_TOOLBAR).toContain("min-[1180px]:max-xl:gap-0")
    expect(ROADMAP_CARD_TOOLBAR).not.toMatch(/(?:^|\s)gap-0(?:\s|$)/)
  })
})
