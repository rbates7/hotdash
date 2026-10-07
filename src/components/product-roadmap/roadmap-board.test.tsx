import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HeaderActions } from "@/components/product-roadmap/header-actions"
import { SPAWN_TICKET_LABEL, SPAWN_TICKET_TITLE } from "@/components/product-roadmap/item-dialog"
import { SAVE_FAILED_TEXT } from "@/components/product-roadmap/persistence-note"
import { RoadmapBoard } from "@/components/product-roadmap/roadmap-board"
import { SOURCE_CHIP_TITLE, TICKETS_TITLE } from "@/components/product-roadmap/roadmap-card"
import { RoadmapProvider, STORAGE_KEY } from "@/components/product-roadmap/roadmap-store"

const NOW = Date.parse("2026-10-07T15:00:00.000Z")

afterEach(() => vi.restoreAllMocks())

function Screen({ nowMs = NOW }: { nowMs?: number }) {
  return (
    <RoadmapProvider nowMs={nowMs}>
      <HeaderActions />
      <RoadmapBoard />
    </RoadmapProvider>
  )
}

const column = (name: string) => screen.getByRole("region", { name })
const cardsIn = (name: string) => within(column(name)).queryAllByRole("article")
const titlesIn = (name: string) => cardsIn(name).map((c) => c.getAttribute("aria-label"))
const card = (title: string) => screen.getByRole("article", { name: title })
const note = () => screen.getByTestId("persistence-note")

describe("board", () => {
  it("renders Now / Next / Later with counts and the seed in order", () => {
    render(<Screen />)
    expect(titlesIn("Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])
    expect(titlesIn("Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import"])
    expect(titlesIn("Later")).toEqual(["Auto-scout from film", "Parent recap emails"])
    expect(within(column("Now")).getByLabelText("3 bets")).toHaveTextContent("3")
    expect(within(column("Later")).getByLabelText("2 bets")).toHaveTextContent("2")
    expect(within(column("Now")).getByRole("heading", { level: 2, name: "Now" })).toBeInTheDocument()
  })

  it("shows the card anatomy: title, why, owner, window, source chip, ticket count", () => {
    render(<Screen />)
    const flag = card("Flag Football 2026")
    expect(within(flag).getByRole("heading", { level: 3 })).toHaveTextContent("Flag Football 2026")
    expect(flag).toHaveTextContent("biggest wave of new coaches")
    expect(flag).toHaveTextContent("Rashad")
    expect(flag).toHaveTextContent("Q4 2026")
    expect(within(flag).getByTitle(TICKETS_TITLE)).toHaveTextContent("4 tickets")
    expect(within(flag).queryByTitle(SOURCE_CHIP_TITLE)).toBeNull()

    const share = card("Play share links")
    expect(share).toHaveTextContent("Mace")
    expect(share).toHaveTextContent("Nov 2026")
    expect(within(share).getByTitle(SOURCE_CHIP_TITLE)).toHaveTextContent("From Feature Request")
    expect(within(card("Staff seats")).getByTitle(TICKETS_TITLE)).toHaveTextContent("No tickets")
    expect(within(card("Web import from a link")).getByTitle(TICKETS_TITLE)).toHaveTextContent("1 ticket")
  })

  it("windows and dates follow the clock it is handed", () => {
    render(<Screen nowMs={Date.parse("2027-03-01T15:00:00.000Z")} />)
    expect(card("Flag Football 2026")).toHaveTextContent("Q1 2027")
    expect(card("Play share links")).toHaveTextContent("Apr 2027")
    expect(card("Parent recap emails")).toHaveTextContent("2028")
  })

  it("labels every seed card, the page and the notice as sample data", () => {
    render(<Screen />)
    const tags = screen.getAllByTestId("sample-data-tag")
    expect(tags).toHaveLength(8)
    for (const tag of tags) expect(tag).toHaveTextContent("Sample data")
    expect(screen.getByTestId("sample-data-badge")).toHaveTextContent("Sample data")
    expect(screen.getByRole("note", { name: "Sample data" })).toHaveTextContent(
      "8 bets tagged below are invented examples"
    )
  })

  it("shows skeletons, never the seed, until localStorage has been read", () => {
    // Watch the DOM from before mount: whatever nodes get swapped out must be
    // the skeleton, and no removed node may ever have been a card.
    const removed: Element[] = []
    const collect = (records: MutationRecord[]) => {
      for (const r of records) r.removedNodes.forEach((n) => n instanceof Element && removed.push(n))
    }
    const observer = new MutationObserver(collect)
    observer.observe(document.body, { childList: true, subtree: true })

    render(<Screen />)
    collect(observer.takeRecords())
    observer.disconnect()

    const wasSkeleton = (el: Element) =>
      el.getAttribute("aria-label") === "Loading saved bets" ||
      el.querySelector('[data-slot="skeleton"]') !== null
    expect(removed.length).toBeGreaterThan(0)
    expect(removed.every(wasSkeleton)).toBe(true)
    expect(removed.some((el) => el.textContent?.includes("Flag Football 2026"))).toBe(false)
    expect(screen.queryByRole("status", { name: "Loading saved bets" })).toBeNull()
  })

  it("disables the edge controls: first can't go up or left, last can't go down or right", () => {
    render(<Screen />)
    const first = card("Flag Football 2026")
    expect(within(first).getByRole("button", { name: "Move up" })).toBeDisabled()
    expect(within(first).getByRole("button", { name: "Move down" })).toBeEnabled()
    expect(within(first).getByRole("button", { name: "Already first column" })).toBeDisabled()
    expect(within(first).getByRole("button", { name: "Move to Next" })).toBeEnabled()

    const last = card("Parent recap emails")
    expect(within(last).getByRole("button", { name: "Move down" })).toBeDisabled()
    expect(within(last).getByRole("button", { name: "Move to Next" })).toBeEnabled()
    expect(within(last).getByRole("button", { name: "Already last column" })).toBeDisabled()

    const middle = card("Staff seats")
    expect(within(middle).getByRole("button", { name: "Move to Now" })).toBeEnabled()
    expect(within(middle).getByRole("button", { name: "Move to Later" })).toBeEnabled()
  })

  it("reorders within a column with up/down and persists", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    expect(note()).toHaveTextContent("Edits save in this browser")
    await user.click(within(card("iPad forced updates")).getByRole("button", { name: "Move up" }))
    expect(titlesIn("Now")).toEqual(["Flag Football 2026", "iPad forced updates", "Play share links"])
    await user.click(within(card("iPad forced updates")).getByRole("button", { name: "Move up" }))
    expect(titlesIn("Now")).toEqual(["iPad forced updates", "Flag Football 2026", "Play share links"])
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Move down" }))
    expect(titlesIn("Now")).toEqual(["iPad forced updates", "Play share links", "Flag Football 2026"])
    expect(note()).toHaveTextContent("Saved in this browser")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("iPad forced updates")
    // Moving is not rewriting: still sample data.
    expect(screen.getAllByTestId("sample-data-tag")).toHaveLength(8)
  })

  it("moves a bet between columns; it lands at the bottom and keeps its tag", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(within(card("Staff seats")).getByRole("button", { name: "Move to Now" }))
    expect(titlesIn("Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Staff seats"])
    expect(titlesIn("Next")).toEqual(["Web import from a link", "CSV web import"])
    expect(within(card("Staff seats")).getByTestId("sample-data-tag")).toBeInTheDocument()
    await user.click(within(card("Staff seats")).getByRole("button", { name: "Move to Next" }))
    await user.click(within(card("Staff seats")).getByRole("button", { name: "Move to Later" }))
    expect(titlesIn("Later")).toEqual(["Auto-scout from film", "Parent recap emails", "Staff seats"])
    expect(within(card("Staff seats")).getByRole("button", { name: "Already last column" })).toBeDisabled()
  })

  it("adds a bet through the dialog into the chosen column, not sample data", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(screen.getByRole("button", { name: "New bet" }))
    const dialog = await screen.findByRole("dialog", { name: "New bet" })
    const add = within(dialog).getByRole("button", { name: /Add bet/ })
    expect(add).toBeDisabled()

    const title = within(dialog).getByRole("textbox", { name: "Bet title" })
    expect(title).toHaveAttribute("maxlength", "80")
    expect(within(dialog).getByRole("textbox", { name: "Why it matters" })).toHaveAttribute("maxlength", "160")
    expect(within(dialog).getByRole("textbox", { name: "Target window" })).toHaveAttribute("maxlength", "24")

    await user.type(title, "Practice plan templates")
    await user.type(within(dialog).getByRole("textbox", { name: "Why it matters" }), "Reusable weekly plans.")
    await user.type(within(dialog).getByRole("textbox", { name: "Target window" }), "Q1 2027")
    await user.click(within(within(dialog).getByRole("group", { name: "Owner" })).getByRole("button", { name: "Mace" }))
    const columns = within(dialog).getByRole("group", { name: "Column" })
    expect(within(columns).getByRole("button", { name: "Later" })).toHaveAttribute("aria-pressed", "true")
    await user.click(within(columns).getByRole("button", { name: "Next" }))
    await user.click(add)

    expect(screen.queryByRole("dialog", { name: "New bet" })).not.toBeInTheDocument()
    expect(titlesIn("Next")).toEqual(["Web import from a link", "Staff seats", "CSV web import", "Practice plan templates"])
    const added = card("Practice plan templates")
    expect(added).toHaveTextContent("Reusable weekly plans.")
    expect(added).toHaveTextContent("Mace")
    expect(added).toHaveTextContent("Q1 2027")
    expect(within(added).getByTitle(TICKETS_TITLE)).toHaveTextContent("No tickets")
    expect(within(added).queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.getAllByTestId("sample-data-tag")).toHaveLength(8)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Practice plan templates")
  })

  it("edits a bet; rewriting drops the sample tag; a no-op edit cannot be saved", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(within(card("Web import from a link")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Web import from a link" })
    expect(dialog).toHaveTextContent("Signed 9 days ago · 28 Sep 2026 · from Feature Request")
    expect(within(dialog).getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(dialog).toHaveTextContent("1 ticket linked · sample count, display only")

    const save = within(dialog).getByRole("button", { name: /Save/ })
    expect(save).toBeDisabled()
    // Typing the same words back is not an edit.
    const title = within(dialog).getByRole("textbox", { name: "Bet title" })
    await user.type(title, " ")
    expect(save).toBeDisabled()

    await user.clear(title)
    await user.type(title, "Import a play from a HUDL link")
    const window_ = within(dialog).getByRole("textbox", { name: "Target window" })
    await user.clear(window_)
    await user.type(window_, "Dec 2026")
    expect(save).toBeEnabled()
    await user.click(save)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    const edited = card("Import a play from a HUDL link")
    expect(edited).toHaveTextContent("Dec 2026")
    expect(within(edited).queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.getAllByTestId("sample-data-tag")).toHaveLength(7)
    expect(screen.getByRole("note", { name: "Sample data" })).toHaveTextContent("7 bets")
    expect(titlesIn("Next")[0]).toBe("Import a play from a HUDL link") // same place in the sequence
  })

  it("re-owning from the dialog keeps the sample tag", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(within(card("Staff seats")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Staff seats" })
    const owners = within(dialog).getByRole("group", { name: "Owner" })
    expect(within(owners).getByRole("button", { name: "Rashad" })).toHaveAttribute("aria-pressed", "true")
    await user.click(within(owners).getByRole("button", { name: "Mace" }))
    await user.click(within(dialog).getByRole("button", { name: /Save/ }))
    expect(card("Staff seats")).toHaveTextContent("Mace")
    expect(within(card("Staff seats")).getByTestId("sample-data-tag")).toBeInTheDocument()
  })

  it("offers Spawn ticket as a disabled, explained affordance and never touches the issues store", async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Flag Football 2026" })
    const spawn = within(dialog).getByRole("button", { name: SPAWN_TICKET_LABEL })
    expect(spawn).toBeDisabled()
    expect(spawn).toHaveAttribute("title", SPAWN_TICKET_TITLE)
    expect(SPAWN_TICKET_TITLE).toMatch(/Agent Workplace ticket/)
    expect(SPAWN_TICKET_TITLE).toMatch(/Not wired yet/)
    await user.click(spawn)
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem("hotdash.agent-workplace.v1")).toBeNull()
  })

  it("deletes a bet after a confirm step", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(within(card("Parent recap emails")).getByRole("button", { name: "Edit" }))
    const dialog = await screen.findByRole("dialog", { name: "Bet: Parent recap emails" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    // Nothing happens until the second click: still no edit, so still nothing saved.
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }))
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    await user.click(within(dialog).getByRole("button", { name: "Confirm delete" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(titlesIn("Later")).toEqual(["Auto-scout from film"])
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("Parent recap emails")
  })

  it("shows the empty board and per-column empties when nothing is saved for any column", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: [], nextId: 1 }))
    render(<Screen />)
    expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("No bets on the roadmap")
    for (const name of ["Now", "Next", "Later"]) {
      expect(column(name)).toHaveTextContent(`Nothing in ${name}`)
      expect(cardsIn(name)).toHaveLength(0)
    }
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByTestId("sample-data-badge")).toBeNull()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
  })

  it("shows a per-column empty state while the board still has bets", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(within(card("Auto-scout from film")).getByRole("button", { name: "Move to Next" }))
    await user.click(within(card("Parent recap emails")).getByRole("button", { name: "Move to Next" }))
    expect(column("Later")).toHaveTextContent("Nothing in Later")
    expect(screen.queryByRole("status", { name: "Empty board" })).toBeNull()
    expect(titlesIn("Next")).toHaveLength(5)
  })

  it("Reset is disabled until something is saved, asks first, then clears the copy", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset).toBeDisabled()
    expect(note()).toHaveTextContent("Edits save in this browser")

    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Move to Next" }))
    expect(reset).toBeEnabled()
    expect(note()).toHaveTextContent("Saved in this browser")
    await user.click(reset)
    const dialog = await screen.findByRole("dialog", { name: "Reset the roadmap?" })
    expect(dialog).toHaveTextContent("There is no undo")
    await user.click(within(dialog).getByRole("button", { name: "Keep my edits" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(titlesIn("Next")).toContain("Flag Football 2026")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    await user.click(reset)
    await user.click(within(await screen.findByRole("dialog", { name: "Reset the roadmap?" })).getByRole("button", { name: "Confirm reset" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(titlesIn("Now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates"])
    expect(screen.getAllByTestId("sample-data-tag")).toHaveLength(8)
    expect(note()).toHaveTextContent("Edits save in this browser")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
  })

  it("the note says when a save did not land", async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    render(<Screen />)
    await user.click(within(card("Flag Football 2026")).getByRole("button", { name: "Move down" }))
    expect(note()).toHaveTextContent(SAVE_FAILED_TEXT)
    expect(note()).toHaveAttribute("role", "alert")
    expect(titlesIn("Now")[1]).toBe("Flag Football 2026") // the edit still shows for the session
  })
})
