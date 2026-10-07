import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FeatureRequestsProvider,
  STORAGE_KEY,
} from "@/components/feature-request/feature-requests-store"
import { HeaderActions } from "@/components/feature-request/header-actions"
import { MOVE_TO_ROADMAP, ROADMAP_HANDOFF_NOTE } from "@/components/feature-request/idea-dialog"
import { PERSISTENCE_COPY } from "@/components/persistence-note"

const NOTE_FAILED = PERSISTENCE_COPY.failed
const NOTE_SAVED = PERSISTENCE_COPY.saved
const NOTE_UNSAVED = PERSISTENCE_COPY.unsaved
import { RequestBoard } from "@/components/feature-request/request-board"
import { ROADMAP_HINT_TITLE } from "@/components/feature-request/request-card"

const TODAY = new Date("2026-08-24T15:00:00.000Z")

afterEach(() => vi.restoreAllMocks())

function Screen() {
  return (
    <FeatureRequestsProvider nowMs={TODAY.getTime()}>
      <HeaderActions />
      <RequestBoard />
    </FeatureRequestsProvider>
  )
}

const column = (name: string) => screen.getByRole("region", { name })
const cardsIn = (name: string) =>
  within(column(name)).getAllByRole("button", { name: /^Open idea:/ })
const card = (title: string) =>
  screen.getByRole("button", { name: `Open idea: ${title}` })
/** Tags on cards only; the header carries one more while sample cards remain. */
const board = () => screen.getByRole("region", { name: "Feature request intake" })
const cardTags = () => within(board()).queryAllByTestId("sample-data-tag")
const headerTag = () => screen.queryAllByTestId("sample-data-tag").length - cardTags().length

describe("board", () => {
  it("renders the four mock columns with their counts and cards, newest first", () => {
    render(<Screen />)
    expect(cardsIn("Inbox")).toHaveLength(3)
    expect(cardsIn("Triaged")).toHaveLength(3)
    expect(cardsIn("On Roadmap")).toHaveLength(2)
    expect(cardsIn("Parked")).toHaveLength(2)
    expect(within(column("Inbox")).getByLabelText("3 ideas")).toHaveTextContent("3")

    expect(cardsIn("Inbox").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Open idea: Play of the Day",
      "Open idea: Web import from a link",
      "Open idea: Staff share sheet",
    ])
    expect(card("Play of the Day")).toHaveTextContent("24 Aug 2026")
    expect(card("Parent recap emails")).toHaveTextContent("9 Jul 2026")
  })

  it("labels every seed card, the page and the notice as sample data (shared components)", () => {
    render(<Screen />)
    const tags = cardTags()
    expect(tags).toHaveLength(10)
    for (const tag of tags) expect(tag).toHaveTextContent("Sample data")
    expect(headerTag()).toBe(1)
    const note = screen.getByRole("note", { name: "Sample data" })
    expect(note).toHaveTextContent("10 cards tagged below are invented examples")
  })

  it("marks the roadmap hint as board-only, with no promise of a handoff", () => {
    render(<Screen />)
    const hint = within(card("Play share links")).getByTitle(ROADMAP_HINT_TITLE)
    expect(hint).toHaveTextContent("Roadmap")
    expect(ROADMAP_HINT_TITLE).toMatch(/isn't wired yet/)
    expect(within(card("Play of the Day")).queryByTitle(ROADMAP_HINT_TITLE)).toBeNull()
  })

  it("shows skeletons, never the seed, until localStorage has been read", () => {
    // Watch the DOM from before mount: whatever nodes get swapped out must be
    // the skeleton, and no removed node may ever have been a card.
    const removed: Element[] = []
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        r.removedNodes.forEach((n) => {
          if (n instanceof Element) removed.push(n)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    render(<Screen />)
    observer.takeRecords().forEach((r) =>
      r.removedNodes.forEach((n) => {
        if (n instanceof Element) removed.push(n)
      })
    )
    observer.disconnect()

    const wasSkeleton = (el: Element) =>
      el.getAttribute("aria-label") === "Loading saved ideas" ||
      el.querySelector('[data-slot="skeleton"]') !== null
    expect(removed.length).toBeGreaterThan(0)
    expect(removed.every(wasSkeleton)).toBe(true)
    expect(removed.some((el) => el.textContent?.includes("Play of the Day"))).toBe(false)
    expect(screen.queryByRole("status", { name: "Loading saved ideas" })).toBeNull()
  })

  it("adds an idea through the dialog; it lands at the top of Inbox and is not sample data", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(screen.getByRole("button", { name: "New idea" }))
    const dialog = await screen.findByRole("dialog", { name: "New idea" })
    const add = within(dialog).getByRole("button", { name: /Add idea/ })
    expect(add).toBeDisabled()

    await user.type(within(dialog).getByRole("textbox", { name: "Idea title" }), "Practice plan templates")
    await user.type(within(dialog).getByRole("textbox", { name: "The ask" }), "Reusable weekly plans.")
    expect(within(dialog).getByRole("textbox", { name: "From" })).toHaveValue("Dan")
    await user.click(add)

    expect(screen.queryByRole("dialog", { name: "New idea" })).not.toBeInTheDocument()
    const inbox = cardsIn("Inbox")
    expect(inbox).toHaveLength(4)
    expect(inbox[0]).toHaveAccessibleName("Open idea: Practice plan templates")
    expect(inbox[0]).toHaveTextContent("Reusable weekly plans.")
    expect(inbox[0]).toHaveTextContent("24 Aug 2026")
    expect(within(inbox[0]).queryByTestId("sample-data-tag")).toBeNull()
    expect(cardTags()).toHaveLength(10)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Practice plan templates")
  })

  it("opens a card, shows when it was added, and saves an edit that drops the sample tag", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(card("Web import from a link"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Web import from a link" })
    expect(dialog).toHaveTextContent("Added 2 days ago · 22 Aug 2026")
    expect(within(dialog).getByTestId("sample-data-tag")).toBeInTheDocument()

    const save = within(dialog).getByRole("button", { name: /Save/ })
    expect(save).toBeDisabled()
    const title = within(dialog).getByRole("textbox", { name: "Idea title" })
    await user.clear(title)
    await user.type(title, "Import a play from a HUDL link")
    expect(save).toBeEnabled()
    await user.click(save)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    const edited = card("Import a play from a HUDL link")
    expect(within(edited).queryByTestId("sample-data-tag")).toBeNull()
    expect(cardTags()).toHaveLength(9)
    expect(screen.getByRole("note", { name: "Sample data" })).toHaveTextContent("9 cards")
  })

  it("changes status from the dialog and the card moves columns", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(card("Staff share sheet"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Staff share sheet" })
    const status = within(dialog).getByRole("group", { name: "Status" })
    expect(within(status).getByRole("button", { name: "Inbox" })).toHaveAttribute("aria-pressed", "true")
    await user.click(within(status).getByRole("button", { name: "Parked" }))
    expect(dialog).toHaveTextContent("Not now. Kept so it is not lost.")
    await user.click(within(dialog).getByRole("button", { name: /Save/ }))

    expect(cardsIn("Inbox")).toHaveLength(2)
    expect(cardsIn("Parked")).toHaveLength(3)
    expect(within(column("Parked")).getByRole("button", { name: "Open idea: Staff share sheet" })).toBeInTheDocument()
    // Moving is not rewriting: still sample data.
    expect(within(card("Staff share sheet")).getByTestId("sample-data-tag")).toBeInTheDocument()
  })

  it("Move to On Roadmap only moves the card here and says so", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(card("Custom play headers"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Custom play headers" })
    expect(dialog).toHaveTextContent(ROADMAP_HANDOFF_NOTE)
    expect(ROADMAP_HANDOFF_NOTE).toMatch(/nothing is sent anywhere/)
    await user.click(within(dialog).getByRole("button", { name: MOVE_TO_ROADMAP }))

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(cardsIn("On Roadmap")).toHaveLength(3)
    const moved = within(column("On Roadmap")).getByRole("button", { name: "Open idea: Custom play headers" })
    expect(within(moved).getByTitle(ROADMAP_HINT_TITLE)).toBeInTheDocument()

    // Already on the roadmap: no button, just the honest note.
    await user.click(moved)
    const again = await screen.findByRole("dialog", { name: "Idea: Custom play headers" })
    expect(within(again).queryByRole("button", { name: MOVE_TO_ROADMAP })).toBeNull()
    expect(MOVE_TO_ROADMAP).toBe("Move to On Roadmap")
    expect(again).toHaveTextContent("On Roadmap here only.")
  })

  it("deletes a card after a confirm step", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(card("Parent recap emails"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Parent recap emails" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    // Nothing happens until the second click: still no edit, so still nothing saved.
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    await user.click(within(dialog).getByRole("button", { name: "Confirm delete" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("Parent recap emails")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(cardsIn("Parked")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Open idea: Parent recap emails" })).toBeNull()
  })

  it("shows the empty board when nothing is saved for any column, with no sample labels", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [], nextId: 1 }))
    render(<Screen />)
    expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("Nothing on the board")
    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      expect(column(name)).toHaveTextContent(`Nothing in ${name}`)
      expect(within(column(name)).queryAllByRole("button")).toHaveLength(0)
    }
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
  })

  it("Reset is disabled until something is saved, then asks before it acts", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    const note = screen.getByTestId("persistence-note")
    expect(note).toHaveTextContent(NOTE_UNSAVED)
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset).toBeDisabled()
    expect(reset).toHaveAttribute("title", "Nothing is saved in this browser yet")

    await user.click(card("Play of the Day"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Play of the Day" })
    const status = within(dialog).getByRole("group", { name: "Status" })
    await user.click(within(status).getByRole("button", { name: "Triaged" }))
    await user.click(within(dialog).getByRole("button", { name: /Save/ }))
    expect(note).toHaveTextContent(NOTE_SAVED)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"status":"triaged"')
    expect(reset).toBeEnabled()

    // First click only asks (the shared confirm dialog).
    await user.click(reset)
    const confirm = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(confirm).getByRole("button", { name: "Keep my edits" }))
    expect(screen.queryByRole("dialog", { name: "Reset demo data?" })).not.toBeInTheDocument()
    expect(cardsIn("Triaged")).toHaveLength(4)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"status":"triaged"')

    // Second time through, confirmed.
    await user.click(reset)
    const again = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(again).getByRole("button", { name: "Reset" }))
    expect(cardsIn("Triaged")).toHaveLength(3)
    expect(cardsIn("Inbox")).toHaveLength(3)
    expect(note).toHaveTextContent(NOTE_UNSAVED)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
  })

  it("Reset from an empty board brings the sample cards back", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [], nextId: 1 }))
    render(<Screen />)
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(NOTE_SAVED)
    await user.click(screen.getByRole("button", { name: "Reset" }))
    const confirm = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(confirm).getByRole("button", { name: "Reset" }))
    expect(screen.queryByRole("status", { name: "Empty board" })).toBeNull()
    expect(cardTags()).toHaveLength(10)
  })

  it("says so when a save fails, and keeps the edit on the board", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    await user.click(screen.getByRole("button", { name: "New idea" }))
    const dialog = await screen.findByRole("dialog", { name: "New idea" })
    await user.type(within(dialog).getByRole("textbox", { name: "Idea title" }), "Won't fit")
    await user.click(within(dialog).getByRole("button", { name: /Add idea/ }))
    expect(card("Won't fit")).toBeInTheDocument()
    const note = screen.getByTestId("persistence-note")
    expect(note).toHaveTextContent(NOTE_FAILED)
    expect(note).toHaveAttribute("role", "alert")
    expect(NOTE_FAILED).toBe("Couldn't save in this browser")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    // Nothing is saved, so there is nothing to reset.
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
  })

  it("caps what the inputs accept", async () => {
    const user = userEvent.setup()
    render(<Screen />)
    await user.click(screen.getByRole("button", { name: "New idea" }))
    const dialog = await screen.findByRole("dialog", { name: "New idea" })
    expect(within(dialog).getByRole("textbox", { name: "Idea title" })).toHaveAttribute("maxlength", "120")
    expect(within(dialog).getByRole("textbox", { name: "The ask" })).toHaveAttribute("maxlength", "280")
    expect(within(dialog).getByRole("textbox", { name: "From" })).toHaveAttribute("maxlength", "40")
    await user.keyboard("{Escape}")
    await user.click(card("Play of the Day"))
    const edit = await screen.findByRole("dialog", { name: "Idea: Play of the Day" })
    expect(within(edit).getByRole("textbox", { name: "Idea title" })).toHaveAttribute("maxlength", "120")
    expect(within(edit).getByRole("textbox", { name: "The ask" })).toHaveAttribute("maxlength", "280")
    expect(within(edit).getByRole("textbox", { name: "From" })).toHaveAttribute("maxlength", "40")
  })
})
