import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PERSISTENCE_NOTE_NAME } from "@/components/persistence-note"
import {
  HeaderActions,
  NEW_BET_CONNECTING_TITLE,
  NEW_BET_READ_ONLY_TITLE,
} from "@/components/product-roadmap/header-actions"
import {
  NOTION_CONNECTING_COPY,
  NOTION_NOT_CONNECTED_COPY,
  RoadmapBoard,
} from "@/components/product-roadmap/roadmap-board"
import { READ_ONLY_TITLE } from "@/components/product-roadmap/roadmap-card"
import { NOTION_SOURCE_COPY, NOTION_SOURCE_NOTE_NAME } from "@/components/product-roadmap/roadmap-persistence-note"
import { RoadmapProvider, STORAGE_KEY } from "@/components/product-roadmap/roadmap-store"
import { CONNECTING_POLL_MS, configureNotionRoadmap } from "@/hooks/use-notion-roadmap"
import { NOTION_CONNECTING, type NotionRoadmapSummary } from "@/lib/notion-roadmap"
import { LIVE_ROADMAP, liveRoadmapSummary, setNotionLoadingForTest, setNotionRoadmapForTest } from "@/test/notion"

const NOW = Date.parse("2026-10-14T15:00:00.000Z")
const nativeMatchMedia = window.matchMedia

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})
afterEach(() => {
  window.matchMedia = nativeMatchMedia
  vi.restoreAllMocks()
})

function Screen() {
  return (
    <RoadmapProvider nowMs={NOW}>
      <HeaderActions />
      <RoadmapBoard />
    </RoadmapProvider>
  )
}

const column = (name: string) => screen.getByRole("region", { name })
const titlesIn = (name: string) =>
  within(column(name))
    .queryAllByRole("article")
    .map((c) => c.getAttribute("aria-label"))
const card = (title: string) => screen.getByRole("article", { name: title })

describe("Roadmap, Notion not connected", () => {
  it("says Not connected and shows no bets: no sample board, no Sample label; this browser's board stays editable", () => {
    render(<Screen />)
    expect(screen.getByTestId("notion-not-connected")).toHaveTextContent(`Not connected. ${NOTION_NOT_CONNECTED_COPY}`)
    expect(screen.queryAllByRole("article")).toHaveLength(0)
    expect(screen.queryByText("Flag Football 2026")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-notice")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-badge")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(screen.getByRole("status", { name: PERSISTENCE_NOTE_NAME })).toBeInTheDocument()
    expect(screen.queryByTestId("notion-source-note")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New bet" })).toBeEnabled()
  })

  it("shows a founder's own saved bets, editable, but never the sample bets an old saved copy still holds", () => {
    const at = "2026-10-01T15:00:00.000Z"
    const mine = { id: "rm-9", title: "Mine", why: "", owner: "Rashad", window: "Q1 2027", column: "now", order: 0, linkedTickets: 0, signedAt: at, updatedAt: at }
    const old = { ...mine, id: "rm-1", title: "Flag Football 2026", order: 1, linkedTickets: 4, sample: true }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: [mine, old], nextId: 10 }))
    render(<Screen />)
    expect(titlesIn("Now")).toEqual(["Mine"])
    expect(screen.queryByText("Flag Football 2026")).not.toBeInTheDocument()
    expect(within(card("Mine")).getByRole("button", { name: "Edit" })).toBeEnabled()
    expect(screen.getByTestId("notion-not-connected")).toBeInTheDocument()
  })
})

describe("Roadmap, loading Notion", () => {
  it("shows the skeleton, never sample bets that would then swap", () => {
    setNotionLoadingForTest()
    render(<Screen />)
    expect(screen.getByRole("status", { name: "Loading saved bets" })).toBeInTheDocument()
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-notice")).not.toBeInTheDocument()
    expect(screen.queryByTestId("notion-not-connected")).not.toBeInTheDocument()
  })
})

describe("Roadmap, Notion connecting (token set, first sync running)", () => {
  beforeEach(() => setNotionRoadmapForTest(NOTION_CONNECTING))

  it("shows the skeleton and Connecting to Notion…, never sample bets, never Not connected, not editable", () => {
    render(<Screen />)
    expect(screen.getByTestId("notion-connecting")).toHaveTextContent(NOTION_CONNECTING_COPY)
    expect(screen.getByRole("status", { name: "Loading saved bets" })).toBeInTheDocument()
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-notice")).not.toBeInTheDocument()
    expect(screen.queryByTestId("notion-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByRole("status", { name: PERSISTENCE_NOTE_NAME })).not.toBeInTheDocument()
    const newBet = screen.getByRole("button", { name: "New bet" })
    expect(newBet).toBeDisabled()
    expect(newBet).toHaveAttribute("title", NEW_BET_CONNECTING_TITLE)
  })

  it("swaps to Notion's rows when the first sync lands", async () => {
    vi.useFakeTimers()
    let answer: NotionRoadmapSummary = NOTION_CONNECTING
    configureNotionRoadmap({ initial: { phase: "ready", summary: NOTION_CONNECTING }, fetcher: async () => answer })
    render(<Screen />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByTestId("notion-connecting")).toBeInTheDocument()
    answer = liveRoadmapSummary()
    await act(() => vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS))
    expect(titlesIn("Now")).toEqual(["Coach onboarding v2", "Shared playbooks"])
    expect(screen.queryByTestId("notion-connecting")).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe("Roadmap, Notion connected", () => {
  beforeEach(() => setNotionRoadmapForTest(liveRoadmapSummary()))

  it("shows Notion's rows in the same columns and cards, with no Sample label", () => {
    render(<Screen />)
    expect(titlesIn("Now")).toEqual(["Coach onboarding v2", "Shared playbooks"])
    expect(titlesIn("Next")).toEqual(["Season recap export"])
    expect(titlesIn("Later")).toEqual(["Android tablet app"])
    expect(screen.queryByTestId("sample-data-notice")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-badge")).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(screen.queryByText("Flag Football 2026")).not.toBeInTheDocument()
  })

  it("maps onto the card anatomy: owner, window, Feature Request chip; no owner and no ticket count are left blank", () => {
    render(<Screen />)
    const shared = card("Shared playbooks")
    expect(within(shared).getByText("Mace")).toBeInTheDocument()
    expect(within(shared).getByText("Nov 2026")).toBeInTheDocument()
    expect(within(shared).getByText("From Feature Request")).toBeInTheDocument()
    const recap = card("Season recap export")
    expect(within(recap).queryByText(/ticket/i)).not.toBeInTheDocument()
    expect(within(recap).queryByText("Unassigned")).not.toBeInTheDocument()
    expect(within(recap).getByText("Jan – Feb 2027")).toBeInTheDocument()
  })

  it("is read-only: every card control and New bet are disabled and say why; the note says Notion; no Reset", () => {
    render(<Screen />)
    for (const button of within(card("Coach onboarding v2")).getAllByRole("button")) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute("title", READ_ONLY_TITLE)
    }
    const newBet = screen.getByRole("button", { name: "New bet" })
    expect(newBet).toBeDisabled()
    expect(newBet).toHaveAttribute("title", NEW_BET_READ_ONLY_TITLE)
    expect(screen.getByRole("status", { name: NOTION_SOURCE_NOTE_NAME })).toHaveTextContent(NOTION_SOURCE_COPY)
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument()
  })

  it("leaves this browser's saved edits alone: nothing is written while Notion is shown", async () => {
    const saved = JSON.stringify({ items: [], nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, saved)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(<Screen />)
    await userEvent.click(card("Coach onboarding v2"))
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(saved)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("says how many rows it could not place, never guessing them into a column", () => {
    setNotionRoadmapForTest(liveRoadmapSummary("connected", { ...LIVE_ROADMAP, unplaced: 2 }))
    render(<Screen />)
    expect(screen.getByTestId("notion-unplaced-notice")).toHaveTextContent("2 rows in Notion have no Now, Next or Later status")
  })

  it("an empty Notion roadmap says so, with no New bet / Reset advice", () => {
    setNotionRoadmapForTest(liveRoadmapSummary("connected", { items: [], unplaced: 0 }))
    render(<Screen />)
    expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("No bets on the roadmap in Notion yet.")
  })
})

describe("Roadmap, Notion stale", () => {
  it("keeps the last rows and says Last updated <time>", () => {
    setNotionRoadmapForTest(liveRoadmapSummary("stale"))
    render(<Screen />)
    expect(titlesIn("Now")).toEqual(["Coach onboarding v2", "Shared playbooks"])
    expect(screen.getByRole("status", { name: NOTION_SOURCE_NOTE_NAME })).toHaveTextContent(
      "Last updated Wed, Oct 14 · 9:41 AM CDT"
    )
    expect(screen.queryByTestId("sample-data-notice")).not.toBeInTheDocument()
  })

  it("turns stale in place when our endpoint fails after a good read", async () => {
    vi.useFakeTimers()
    let answer: () => Promise<NotionRoadmapSummary> = async () => liveRoadmapSummary()
    configureNotionRoadmap({ fetcher: () => answer() })
    render(<Screen />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole("status", { name: NOTION_SOURCE_NOTE_NAME })).toHaveTextContent(NOTION_SOURCE_COPY)
    answer = async () => {
      throw new Error("offline")
    }
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(screen.getByRole("status", { name: NOTION_SOURCE_NOTE_NAME })).toHaveTextContent(/^Last updated/)
    expect(titlesIn("Now")).toEqual(["Coach onboarding v2", "Shared playbooks"])
    vi.useRealTimers()
  })
})
