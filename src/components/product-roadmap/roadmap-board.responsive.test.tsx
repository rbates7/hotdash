import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HeaderActions } from "@/components/product-roadmap/header-actions"
import { RoadmapBoard } from "@/components/product-roadmap/roadmap-board"
import { RoadmapProvider } from "@/components/product-roadmap/roadmap-store"
import {
  ROADMAP_BOARD_DESKTOP,
  ROADMAP_BOARD_TABLET,
  ROADMAP_PRESSED,
  ROADMAP_RESET,
} from "@/components/product-roadmap/responsive"
import {
  PHONE_MAX_WIDTH,
  PHONE_QUERY,
  TABLET_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  TABLET_PORTRAIT_MAX_WIDTH,
  TABLET_PORTRAIT_QUERY,
  TABLET_QUERY,
} from "@/hooks/use-mobile"

const TODAY = new Date("2026-10-07T15:00:00.000Z")
const nativeMatchMedia = window.matchMedia

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  window.matchMedia = nativeMatchMedia
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mockViewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query === PHONE_QUERY
        ? width <= PHONE_MAX_WIDTH
        : query === TABLET_PORTRAIT_QUERY
          ? width >= TABLET_MIN_WIDTH && width <= TABLET_PORTRAIT_MAX_WIDTH
          : query === TABLET_QUERY
            ? width >= TABLET_MIN_WIDTH && width <= TABLET_MAX_WIDTH
            : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function Screen() {
  return (
    <RoadmapProvider nowMs={TODAY.getTime()}>
      <HeaderActions />
      <RoadmapBoard />
    </RoadmapProvider>
  )
}

const column = (name: string) => screen.getByRole("region", { name })
const board = () => screen.getByRole("region", { name: "Roadmap sequence" })
const card = (title: string) => screen.getByRole("article", { name: title })

describe("phone (<768): Now/Next/Later segments + one column", () => {
  beforeEach(() => mockViewport(390))

  it("shows Now cards behind a segment and hides the other columns", () => {
    render(<Screen />)
    const chips = screen.getByRole("group", { name: "Filter by column" })
    expect(within(chips).getAllByRole("button").map((t) => t.textContent)).toEqual([
      "Now3",
      "Next3",
      "Later2",
    ])
    expect(within(chips).getByRole("button", { name: /Now/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    for (const button of within(chips).getAllByRole("button")) {
      expect(button.className).toContain("aria-pressed:bg-primary!")
    }
    expect(ROADMAP_PRESSED).toContain("aria-pressed:bg-primary!")

    expect(column("Now")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Next" })).toBeNull()
    expect(screen.queryByRole("region", { name: "Later" })).toBeNull()

    const items = within(column("Now")).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByRole("article", { name: "Flag Football 2026" })).toBeInTheDocument()
    expect(card("Flag Football 2026")).toHaveTextContent("biggest wave of new coaches")
    expect(within(card("Flag Football 2026")).getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(within(card("Flag Football 2026")).getByRole("button", { name: "Move down" })).toBeInTheDocument()
  })

  it("the Next segment swaps the list", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    const chips = screen.getByRole("group", { name: "Filter by column" })
    await user.click(within(chips).getByRole("button", { name: /Next/ }))
    expect(within(chips).getByRole("button", { name: /Next/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.queryByRole("region", { name: "Now" })).toBeNull()
    expect(column("Next")).toBeInTheDocument()
    expect(card("Web import from a link")).toHaveTextContent("From Feature Request")
    expect(within(column("Next")).getAllByRole("listitem")).toHaveLength(3)
  })

  it("opens the existing edit dialog from a card or Edit", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Flag Football 2026" })
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument()
    expect(within(dialog).getByRole("group", { name: "Column" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument()
  })

  it("the × closes the sheet and focus returns to the card", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Flag Football 2026" })
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Bet: Flag Football 2026" })).toBeNull()
    expect(card("Flag Football 2026")).toHaveFocus()
  })

  it("after Delete, focus moves to the next Now card", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Flag Football 2026" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await user.click(within(dialog).getByRole("button", { name: "Confirm delete" }))
    expect(screen.queryByRole("article", { name: "Flag Football 2026" })).toBeNull()
    expect(card("Play share links")).toHaveFocus()
  })

  it("after Move from the sheet, focus moves to the next card in the old column", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Flag Football 2026" })
    await user.click(within(dialog).getByRole("group", { name: "Column" }).getByRole("button", { name: "Next" }))
    expect(screen.queryByRole("dialog", { name: "Bet: Flag Football 2026" })).toBeNull()
    expect(card("Play share links")).toHaveFocus()
  })

  it("after Delete of the last card, focus moves to the column heading", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    await user.click(screen.getByRole("group", { name: "Filter by column" }).getByRole("button", { name: /Later/ }))
    await user.click(within(card("Auto-scout from film")).getByRole("button", { name: "Edit" }))
    const first = await screen.findByRole("dialog", { name: "Bet: Auto-scout from film" })
    await user.click(within(first).getByRole("button", { name: "Delete" }))
    await user.click(within(first).getByRole("button", { name: "Confirm delete" }))
    await user.click(within(card("Parent recap emails")).getByRole("button", { name: "Edit" }))
    const last = await screen.findByRole("dialog", { name: "Bet: Parent recap emails" })
    await user.click(within(last).getByRole("button", { name: "Delete" }))
    await user.click(within(last).getByRole("button", { name: "Confirm delete" }))
    expect(screen.queryByRole("article")).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "Later" })).toHaveFocus()
  })

  it("grows Reset below 1280", () => {
    render(<Screen />)
    expect(screen.getByRole("button", { name: "Reset" })).toHaveClass("max-xl:h-11!")
    expect(screen.getByRole("button", { name: "Reset" })).toHaveClass("max-xl:min-w-11!")
    expect(ROADMAP_RESET).toBe("max-xl:h-11! max-xl:min-w-11!")
  })
})

describe("tablet portrait (820): switcher + 2-column grid of the selected column", () => {
  beforeEach(() => mockViewport(820))

  it("keeps the switcher and lays the selected column out as two columns", () => {
    render(<Screen />)
    expect(screen.getByRole("group", { name: "Filter by column" })).toBeInTheDocument()
    expect(board().className).toContain(ROADMAP_BOARD_TABLET)
    expect(within(column("Now")).getAllByRole("article")).toHaveLength(3)
    expect(screen.queryByRole("region", { name: "Next" })).toBeNull()
    expect(within(column("Now")).getAllByRole("listitem")).toHaveLength(3)
  })
})

describe("desktop / 1180: three columns, no switcher", () => {
  it("matches develop at the default (no phone) viewport", () => {
    mockViewport(1440)
    render(<Screen />)
    expect(screen.queryByRole("group", { name: "Filter by column" })).toBeNull()
    expect(board().className).toContain(ROADMAP_BOARD_DESKTOP)
    expect(within(column("Now")).getAllByRole("article")).toHaveLength(3)
    expect(within(column("Later")).getAllByRole("article")).toHaveLength(2)
    expect(within(column("Now")).queryByRole("list")).toBeNull()
  })

  it("keeps three columns at 1180 (Deke 13:2968)", () => {
    mockViewport(1180)
    render(<Screen />)
    expect(screen.queryByRole("group", { name: "Filter by column" })).toBeNull()
    expect(board().className).toContain(ROADMAP_BOARD_DESKTOP)
    expect(within(column("Next")).getAllByRole("article")).toHaveLength(3)
  })
})
