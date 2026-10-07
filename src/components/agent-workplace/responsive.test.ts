import { describe, expect, it } from "vitest"

import {
  WORKPLACE_AUTOPILOT_CELL,
  WORKPLACE_BOARD,
  WORKPLACE_BOARD_COLUMN,
  WORKPLACE_BOARD_TRACK,
  WORKPLACE_HEADER,
  WORKPLACE_SWITCHER,
} from "@/components/agent-workplace/responsive"

describe("workplace responsive class contracts", () => {
  it("B1: phone cards stretch; tablet columns pin to the start", () => {
    expect(WORKPLACE_BOARD_TRACK).toContain("md:items-start")
    expect(WORKPLACE_BOARD_TRACK.split(/\s+/)).not.toContain("items-start")
    expect(WORKPLACE_BOARD_COLUMN).toContain("max-md:w-full")
  })

  it("B3: board and switcher leave room for focus rings and do not clip paint", () => {
    expect(WORKPLACE_BOARD).toContain("p-[3px]")
    expect(WORKPLACE_BOARD).toContain("xl:p-0")
    expect(WORKPLACE_BOARD).toContain("[contain:layout]")
    expect(WORKPLACE_BOARD).not.toMatch(/contain:paint/)
    expect(WORKPLACE_BOARD.split(/\s+/)).not.toContain("overflow-y-hidden")
    expect(WORKPLACE_SWITCHER).toContain("p-[3px]")
  })

  it("B4: tablet+ header keeps develop's min height", () => {
    expect(WORKPLACE_HEADER).toContain("md:min-h-10")
  })

  it("B6: phone autopilot cells beat Nova padding", () => {
    expect(WORKPLACE_AUTOPILOT_CELL).toContain("max-md:p-0!")
    expect(WORKPLACE_AUTOPILOT_CELL).toContain("max-md:whitespace-normal!")
  })
})
