import { describe, expect, it } from "vitest"

import {
  CD_ADD,
  CD_DESTRUCTIVE,
  CD_DIALOG,
  CD_FILTER_ITEM,
  CD_FILTERS,
  CD_FILTERS_FADE,
  CD_FILTERS_WRAP,
  CD_INPUT,
  CD_MENU_ITEM,
  CD_PAIR,
  CD_PRESSED,
  CD_RESET,
  CD_SHEET,
  CD_TEXTAREA,
  CD_TOGGLE_GROUP,
  CD_TOUCH,
  TABLET_HIDE,
  TABLET_NAME_CELL,
} from "@/components/community-development/responsive"

describe("Community Development responsive layout", () => {
  it("grows Reset, Add, and form controls below 1280 only", () => {
    expect(CD_RESET).toBe("max-xl:h-11! max-xl:min-w-11!")
    expect(CD_ADD).toContain("max-xl:h-11!")
    expect(CD_ADD).toContain("xl:h-9")
    expect(CD_TOUCH).toContain("max-xl:h-11!")
    expect(CD_TOUCH).toContain("max-xl:min-h-[44px]!")
    expect(CD_INPUT).toContain("max-xl:h-11!")
    expect(CD_INPUT).toContain("max-xl:text-base")
    expect(CD_MENU_ITEM).toBe("max-xl:min-h-11")
  })

  it("docks the phone sheet as a full-width bottom sheet with a 44px stock ×", () => {
    expect(CD_SHEET).toContain("max-h-[90dvh]!")
    expect(CD_SHEET).toContain("w-full!")
    expect(CD_SHEET).toContain("max-w-none!")
    expect(CD_SHEET).toContain("rounded-t-xl!")
    expect(CD_SHEET).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(CD_DIALOG).toContain("max-xl:[&_[data-slot=dialog-close]]:size-11!")
    expect(CD_DIALOG).toContain("max-xl:max-h-[90dvh]!")
  })

  it("scrolls filter chips on phone with a right-edge fade and pressed primary", () => {
    expect(CD_FILTERS_WRAP).toContain("relative")
    expect(CD_FILTERS).toContain("max-md:overflow-x-auto")
    expect(CD_FILTERS_FADE).toContain("from-background")
    expect(CD_FILTERS_FADE).toContain("bg-gradient-to-l")
    expect(CD_FILTERS_FADE).toContain("max-md:block")
    expect(CD_FILTER_ITEM).toContain("max-xl:h-11!")
    expect(CD_PRESSED).toContain("aria-pressed:bg-primary!")
    expect(CD_PRESSED).toContain("aria-pressed:text-primary-foreground!")
  })

  it("stacks two-column form grids on phone and keeps the textarea min-height-only below 1280", () => {
    expect(CD_PAIR).toBe("max-md:grid-cols-1")
    expect(CD_TOGGLE_GROUP).toContain("max-md:flex-wrap")
    expect(CD_TEXTAREA).toBe("max-xl:field-sizing-content max-xl:min-h-24!")
    expect(CD_TEXTAREA).not.toMatch(/(?:^|\s)field-sizing-content/)
    expect(CD_TEXTAREA).not.toMatch(/(?:^|\s)min-h-/)
    expect(CD_TEXTAREA).not.toMatch(/(?:^|\s)h-/)
    expect(CD_DESTRUCTIVE).toBe("max-xl:text-danger-text!")
    expect(TABLET_HIDE).toBe("hidden xl:table-cell")
    expect(TABLET_NAME_CELL).toMatch(/max-xl:max-w-0/)
    expect(TABLET_NAME_CELL).toMatch(/max-xl:whitespace-normal!/)
  })
})
