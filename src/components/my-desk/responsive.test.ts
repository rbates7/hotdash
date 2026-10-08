import { describe, expect, it } from "vitest"

import {
  DESK_ACTION,
  DESK_ACTIONS,
  DESK_ADD,
  DESK_CHECK,
  DESK_DELETE_TEXT,
  DESK_DIALOG,
  DESK_DONE_INPUT,
  DESK_FIELD,
  DESK_FOOTER,
  DESK_HEADER,
  DESK_OPEN,
  DESK_PANES,
  DESK_RESET,
  DESK_ROW,
  DESK_SCRATCH,
  DESK_SHEET_CLOSE,
  DESK_TEXTAREA,
} from "@/components/my-desk/responsive"

describe("My Desk responsive layout", () => {
  it("keeps develop's header wrap row from md up and grows Reset / Add below xl", () => {
    expect(DESK_HEADER).toContain("flex-wrap")
    expect(DESK_HEADER).toContain("justify-between")
    expect(DESK_HEADER).toContain("max-md:flex-col")
    expect(DESK_RESET).toBe("max-xl:h-11! max-xl:min-w-11!")
    expect(DESK_ADD).toContain("h-9")
    expect(DESK_ADD).toContain("px-3.5")
    expect(DESK_ADD).toContain("max-xl:h-11!")
    expect(DESK_ADD).toContain("max-md:absolute")
  })

  it("stacks Today + Notes below 1280 so 1180 matches 820, and is two columns at xl", () => {
    expect(DESK_PANES).toContain("grid-cols-1")
    expect(DESK_PANES).toContain("xl:grid-cols-2")
    expect(DESK_PANES).not.toContain("lg:grid-cols-2")
  })

  it("turns list rows into cards below 1280 and hides phone-only open from md up", () => {
    expect(DESK_ROW).toContain("flex items-start gap-3")
    expect(DESK_ROW).toContain("max-xl:rounded-xl")
    expect(DESK_ROW).toContain("max-xl:border")
    expect(DESK_ROW).toContain("max-xl:overflow-hidden")
    expect(DESK_CHECK).toContain("size-4")
    expect(DESK_CHECK).toContain("max-xl:size-11!")
    expect(DESK_CHECK).toContain("max-xl:focus-visible:ring-inset")
    expect(DESK_OPEN).toContain("md:hidden")
    expect(DESK_OPEN).toContain("size-11!")
    expect(DESK_ACTIONS).toContain("max-md:hidden")
    expect(DESK_ACTION).toContain("max-xl:h-11!")
    expect(DESK_DELETE_TEXT).toBe("max-xl:text-danger-text!")
    expect(DESK_DELETE_TEXT).not.toMatch(/(?:^|\s)text-danger-text/)
  })

  it("scopes dialog, sheet ×, fields, and textarea overrides to below 1280", () => {
    expect(DESK_DIALOG).toContain("max-xl:[&>[data-slot=dialog-close]]:size-11!")
    expect(DESK_DIALOG).toContain("max-md:max-h-[calc(100dvh-2rem)]")
    expect(DESK_SHEET_CLOSE).toBe("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(DESK_FIELD).toBe("max-xl:h-11!")
    expect(DESK_FOOTER).toBe("max-xl:h-11!")
    expect(DESK_DONE_INPUT).toContain("size-4")
    expect(DESK_DONE_INPUT).toContain("max-xl:size-11!")
    expect(DESK_TEXTAREA).toContain("max-xl:field-sizing-content")
    expect(DESK_TEXTAREA).toContain("max-xl:min-h-24!")
    expect(DESK_TEXTAREA).not.toMatch(/(?:^|\s)field-sizing-content/)
    expect(DESK_TEXTAREA).not.toMatch(/(?:^|\s)min-h-/)
    expect(DESK_TEXTAREA).not.toMatch(/(?:^|\s)h-/)
    expect(DESK_SCRATCH).toContain("min-h-[220px]")
    expect(DESK_SCRATCH).toContain("max-xl:field-sizing-content")
    expect(DESK_SCRATCH).toContain("max-xl:min-h-24!")
    expect(DESK_SCRATCH).toContain("max-xl:focus-visible:ring-inset")
  })
})
