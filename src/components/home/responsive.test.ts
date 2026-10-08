import { describe, expect, it } from "vitest"

import {
  HOME_BOARD_COLUMNS,
  HOME_BOARD_TILE,
  HOME_BOARD_TILE_LABEL,
  HOME_DOORS,
  HOME_DUMMY,
  HOME_HEADER,
  HOME_HEADER_META,
  HOME_INBOX_DOOR,
  HOME_KPI_HEAD,
  HOME_NEED_ROW,
  HOME_NOTE,
  HOME_RESET,
  HOME_TOUCH,
} from "@/components/home/responsive"

describe("Home responsive layout", () => {
  it("stacks the header on phone and restores the desktop row at xl", () => {
    expect(HOME_HEADER).toContain("flex-col")
    expect(HOME_HEADER).toContain("max-md:w-full")
    expect(HOME_HEADER).toContain("xl:flex-row")
    expect(HOME_HEADER).toContain("xl:justify-between")
    expect(HOME_HEADER_META).toContain("flex-wrap")
    expect(HOME_HEADER_META).toContain("w-full")
    expect(HOME_HEADER_META).toContain("xl:w-auto")
    expect(HOME_DUMMY).toContain("shrink-0")
    expect(HOME_DUMMY).toContain("whitespace-nowrap")
    expect(HOME_DUMMY).not.toContain("truncate")
    expect(HOME_NOTE).toBe("max-w-full shrink-0 flex-wrap")
    expect(HOME_RESET).toBe("max-xl:h-11! max-xl:px-2.5!")
  })

  it("puts doors 1-up on phone, 2+1 on tablet, 3-up on desktop", () => {
    expect(HOME_DOORS).toContain("grid-cols-1")
    expect(HOME_DOORS).toContain("md:grid-cols-2")
    expect(HOME_DOORS).toContain("xl:grid-cols-3")
    expect(HOME_INBOX_DOOR).toContain("md:col-span-2")
    expect(HOME_INBOX_DOOR).toContain("xl:col-span-1")
  })

  it("wraps board counters 3-up below xl and keeps five columns on desktop", () => {
    expect(HOME_BOARD_COLUMNS).toContain("grid-cols-3")
    expect(HOME_BOARD_COLUMNS).toContain("xl:grid-cols-5")
    expect(HOME_BOARD_TILE).toContain("overflow-hidden")
    expect(HOME_BOARD_TILE).toContain("min-w-0")
    expect(HOME_BOARD_TILE_LABEL).toContain("w-full")
    expect(HOME_BOARD_TILE_LABEL).toContain("min-w-0")
    expect(HOME_BOARD_TILE_LABEL.split(/\s+/)).not.toContain("truncate")
  })

  it("lets the truth-strip label wrap and grows compact tap targets", () => {
    expect(HOME_KPI_HEAD).toContain("flex-wrap")
    expect(HOME_TOUCH).toContain("max-xl:h-11!")
    expect(HOME_NEED_ROW).toBe("min-h-11")
  })
})
