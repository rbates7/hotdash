import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatRelative } from "@/lib/clock"
import {
  FeatureRequestsProvider,
  STORAGE_KEY,
} from "@/components/feature-request/feature-requests-store"
import { HeaderActions } from "@/components/feature-request/header-actions"
import { MOVE_TO_ROADMAP, ROADMAP_HANDOFF_NOTE } from "@/components/feature-request/idea-dialog"
import { CLEAR_COPY, PERSISTENCE_COPY } from "@/components/persistence-note"
import { buildSeed, founderRequestsState } from "@/lib/feature-requests/fixture"

const NOTE_FAILED = PERSISTENCE_COPY.failed
const NOTE_UNSAVED = PERSISTENCE_COPY.unsaved
import { RequestBoard } from "@/components/feature-request/request-board"
import { ROADMAP_HINT_TITLE } from "@/components/feature-request/request-card"

const TODAY = new Date("2026-08-24T15:00:00.000Z")
const nativeMatchMedia = window.matchMedia

function mockDesktop() {
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
}

// Edit stamps come from the shared clock at the moment of the edit, so pin
// it to the same instant the page was "requested" at. jsdom has no
// matchMedia; treat the suite as desktop so the four-column board stays.
beforeEach(() => {
  mockDesktop()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  window.matchMedia = nativeMatchMedia
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Screen() {
  return (
    <FeatureRequestsProvider nowMs={TODAY.getTime()}>
      <HeaderActions />
      <RequestBoard />
    </FeatureRequestsProvider>
  )
}

/**
 * Renders the page over the founder's saved board (the old sample's cards
 * under ids of their own) unless the test saved its own copy first;
 * `fresh` opens it on nothing saved.
 */
function renderScreen({ fresh = false } = {}) {
  if (!fresh && window.localStorage.getItem(STORAGE_KEY) === null) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(founderRequestsState(TODAY)))
  }
  return render(<Screen />)
}

const column = (name: string) => screen.getByRole("region", { name })
const cardsIn = (name: string) =>
  within(column(name)).getAllByRole("button", { name: /^Open idea:/ })
const card = (title: string) =>
  screen.getByRole("button", { name: `Open idea: ${title}` })

describe("board", () => {
  it("renders the four mock columns with their counts and cards, newest first", () => {
    renderScreen()
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

  it("no card, header or notice says sample data", () => {
    renderScreen()
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
    expect(card("Play of the Day")).not.toHaveAccessibleDescription(/Sample data/)
  })

  it("nothing saved: no sample cards, the empty board, and no Reset wording", () => {
    renderScreen({ fresh: true })
    const empty = screen.getByRole("status", { name: "Empty board" })
    expect(empty).toHaveTextContent("Nothing on the board")
    expect(empty).not.toHaveTextContent(/sample|Reset/i)
    expect(screen.queryAllByRole("button", { name: /^Open idea:/ })).toHaveLength(0)
  })

  it("an old saved copy still holding the sample shows only the founder's cards", () => {
    const old = buildSeed(TODAY)
    const mine = founderRequestsState(TODAY).requests[0]
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [...old, mine], nextId: 102 }))
    renderScreen()
    expect(screen.getAllByRole("button", { name: /^Open idea:/ })).toHaveLength(1)
    expect(card(mine.title)).toBeInTheDocument()
  })

  it("marks the roadmap hint as board-only, with no promise of a handoff", () => {
    renderScreen()
    const hint = within(card("Play share links")).getByTitle(ROADMAP_HINT_TITLE)
    expect(hint).toHaveTextContent("Roadmap")
    expect(ROADMAP_HINT_TITLE).toMatch(/isn't wired yet/)
    expect(within(card("Play of the Day")).queryByTitle(ROADMAP_HINT_TITLE)).toBeNull()
    expect(card("Play share links")).toHaveAccessibleDescription(/Roadmap/)
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

    renderScreen()
    observer.takeRecords().forEach((r) =>
      r.removedNodes.forEach((n) => {
        if (n instanceof Element) removed.push(n)
      })
    )
    observer.disconnect()

    const wasSkeleton = (el: Element) =>
      el.getAttribute("aria-label") === "Loading saved ideas" ||
      el.querySelector('[data-slot="skeleton"]') !== null
    // The note's "nothing to clear" hint goes too once the saved copy is read.
    const wasClearHint = (el: Element) => el.textContent === CLEAR_COPY.disabledHint
    expect(removed.length).toBeGreaterThan(0)
    expect(removed.every((el) => wasSkeleton(el) || wasClearHint(el))).toBe(true)
    expect(removed.some((el) => el.textContent?.includes("Play of the Day"))).toBe(false)
    expect(screen.queryByRole("status", { name: "Loading saved ideas" })).toBeNull()
  })

  it("adds an idea through the dialog; it lands at the top of Inbox", async () => {
    const user = userEvent.setup()
    renderScreen()
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
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Practice plan templates")
  })

  it("opens a card, shows when it was added, and saves an edit", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(card("Web import from a link"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Web import from a link" })
    // Shared formatRelative long: older than yesterday reads as a weekday
    // date (the passed copy); the full date rides along as the <time> title.
    expect(formatRelative(Date.parse("2026-08-22T15:00:00.000Z"), TODAY.getTime(), { style: "long" })).toBe("Sat, Aug 22")
    expect(dialog).toHaveTextContent("Added Sat, Aug 22")
    expect(within(dialog).getByText("Sat, Aug 22")).toHaveAttribute("title", "22 Aug 2026")
    expect(within(dialog).queryByTestId("sample-data-tag")).toBeNull()

    const save = within(dialog).getByRole("button", { name: /Save/ })
    expect(save).toBeDisabled()
    const title = within(dialog).getByRole("textbox", { name: "Idea title" })
    await user.clear(title)
    await user.type(title, "Import a play from a HUDL link")
    expect(save).toBeEnabled()
    await user.click(save)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(card("Import a play from a HUDL link")).toBeInTheDocument()
  })

  it("changes status from the dialog and the card moves columns", async () => {
    const user = userEvent.setup()
    renderScreen()
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
  })

  it("Move to On Roadmap only moves the card here and says so", async () => {
    const user = userEvent.setup()
    renderScreen()
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
    renderScreen()
    const before = window.localStorage.getItem(STORAGE_KEY)
    await user.click(card("Parent recap emails"))
    const dialog = await screen.findByRole("dialog", { name: "Idea: Parent recap emails" })
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))
    // Nothing happens until the second click: still no edit, so the saved copy is untouched.
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before)
    await user.click(within(dialog).getByRole("button", { name: "Confirm delete" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("Parent recap emails")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(cardsIn("Parked")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Open idea: Parent recap emails" })).toBeNull()
  })

  it("shows the empty board when nothing is saved for any column, with no sample labels", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [], nextId: 1 }))
    renderScreen()
    expect(screen.getByRole("status", { name: "Empty board" })).toHaveTextContent("Nothing on the board")
    for (const name of ["Inbox", "Triaged", "On Roadmap", "Parked"]) {
      expect(column(name)).toHaveTextContent(`Nothing in ${name}`)
      expect(within(column(name)).queryAllByRole("button")).toHaveLength(0)
    }
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
  })

  it("Clear my entries is off with nothing saved, then asks before it empties the board", async () => {
    const user = userEvent.setup()
    const fresh = renderScreen({ fresh: true })
    const off = screen.getByRole("button", { name: CLEAR_COPY.button })
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(NOTE_UNSAVED)
    expect(off).toHaveAttribute("aria-disabled", "true")
    expect(off).toHaveAttribute("title", CLEAR_COPY.disabledHint)
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
    fresh.unmount()

    renderScreen()
    const note = screen.getByTestId("persistence-note")
    const clear = screen.getByRole("button", { name: CLEAR_COPY.button })
    expect(clear).not.toHaveAttribute("aria-disabled", "true")

    // First click only asks (the shared confirm dialog).
    await user.click(clear)
    const confirm = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    await user.click(within(confirm).getByRole("button", { name: "Keep my edits" }))
    expect(screen.queryByRole("dialog", { name: CLEAR_COPY.title })).not.toBeInTheDocument()
    expect(cardsIn("Triaged")).toHaveLength(3)
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    // Second time through, confirmed: an empty board, no sample cards back.
    await user.click(clear)
    const again = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    await user.click(within(again).getByRole("button", { name: CLEAR_COPY.confirm }))
    expect(screen.getByRole("status", { name: "Empty board" })).toBeInTheDocument()
    expect(screen.queryAllByRole("button", { name: /^Open idea:/ })).toHaveLength(0)
    expect(note).toHaveTextContent(NOTE_UNSAVED)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole("button", { name: CLEAR_COPY.button })).toHaveAttribute("aria-disabled", "true")
  })

  it("says so when a save fails, and keeps the edit on the board", async () => {
    const user = userEvent.setup()
    renderScreen()
    const before = window.localStorage.getItem(STORAGE_KEY)
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
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it("caps what the inputs accept", async () => {
    const user = userEvent.setup()
    renderScreen()
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
