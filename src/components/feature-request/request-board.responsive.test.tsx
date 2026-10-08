import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FeatureRequestsProvider,
} from "@/components/feature-request/feature-requests-store"
import { HeaderActions } from "@/components/feature-request/header-actions"
import { RequestBoard } from "@/components/feature-request/request-board"
import {
  FR_BOARD_DESKTOP,
  FR_BOARD_TABLET,
} from "@/components/feature-request/responsive"
import {
  PHONE_MAX_WIDTH,
  PHONE_QUERY,
  TABLET_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  TABLET_PORTRAIT_MAX_WIDTH,
  TABLET_PORTRAIT_QUERY,
  TABLET_QUERY,
} from "@/hooks/use-mobile"

const TODAY = new Date("2026-08-24T15:00:00.000Z")
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
    <FeatureRequestsProvider nowMs={TODAY.getTime()}>
      <HeaderActions />
      <RequestBoard />
    </FeatureRequestsProvider>
  )
}

const column = (name: string) => screen.getByRole("region", { name })
const board = () => screen.getByRole("region", { name: "Feature request intake" })
const card = (title: string) =>
  screen.getByRole("button", { name: `Open idea: ${title}` })

describe("phone (<768): status chips + one column", () => {
  beforeEach(() => mockViewport(390))

  it("shows Inbox cards behind a chip and hides the other columns", () => {
    render(<Screen />)
    const chips = screen.getByRole("group", { name: "Filter by status" })
    expect(within(chips).getAllByRole("button").map((t) => t.textContent)).toEqual([
      "Inbox3",
      "Triaged3",
      "On Roadmap2",
      "Parked2",
    ])
    expect(within(chips).getByRole("button", { name: /Inbox/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    expect(column("Inbox")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Triaged" })).toBeNull()
    expect(screen.queryByRole("region", { name: "On Roadmap" })).toBeNull()
    expect(screen.queryByRole("region", { name: "Parked" })).toBeNull()

    const items = within(column("Inbox")).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByRole("button", { name: "Open idea: Play of the Day" })).toBeInTheDocument()
    expect(card("Play of the Day")).toHaveTextContent("Pin one ready-to-run play")
    expect(within(card("Play of the Day")).getByTestId("sample-data-tag")).toBeInTheDocument()
  })

  it("the On Roadmap chip swaps the list and keeps the board-only hint", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    const chips = screen.getByRole("group", { name: "Filter by status" })
    await user.click(within(chips).getByRole("button", { name: /On Roadmap/ }))
    expect(within(chips).getByRole("button", { name: /On Roadmap/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.queryByRole("region", { name: "Inbox" })).toBeNull()
    expect(column("On Roadmap")).toBeInTheDocument()
    expect(card("Play share links")).toHaveTextContent("Roadmap")
    expect(within(column("On Roadmap")).getAllByRole("listitem")).toHaveLength(2)
  })

  it("opens the existing idea dialog from a card", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(card("Play of the Day"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Play of the Day" })
    expect(dialog).toHaveTextContent("Move to On Roadmap")
    expect(within(dialog).getByRole("group", { name: "Status" })).toBeInTheDocument()
  })
})

describe("tablet portrait (820): 2×2 of all four columns", () => {
  beforeEach(() => mockViewport(820))

  it("does not use chips and keeps every column on the board", () => {
    render(<Screen />)
    expect(screen.queryByRole("group", { name: "Filter by status" })).toBeNull()
    expect(board().className).toContain(FR_BOARD_TABLET)
    expect(within(column("Inbox")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(3)
    expect(within(column("Triaged")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(3)
    expect(within(column("On Roadmap")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(2)
    expect(within(column("Parked")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(2)
    expect(within(column("Inbox")).queryByRole("list")).toBeNull()
  })
})

describe("desktop / 1180: four columns, no chips", () => {
  it("matches develop at the default (no phone) viewport", () => {
    mockViewport(1440)
    render(<Screen />)
    expect(screen.queryByRole("group", { name: "Filter by status" })).toBeNull()
    expect(board().className).toContain(FR_BOARD_DESKTOP)
    expect(within(column("Inbox")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(3)
    expect(within(column("Parked")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(2)
  })

  it("keeps four columns at 1180 (no Feature Request 1180 frame)", () => {
    mockViewport(1180)
    render(<Screen />)
    expect(screen.queryByRole("group", { name: "Filter by status" })).toBeNull()
    expect(board().className).toContain(FR_BOARD_DESKTOP)
    expect(within(column("Triaged")).getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(3)
  })
})
