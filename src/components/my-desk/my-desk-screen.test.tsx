import * as React from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DESK_MOCK_DAY, SEED_SCRATCH, TODO_LIMITS, formatDeskDate, seedTodos } from "@/lib/my-desk"
import {
  EMPTY_COPY,
  LEDE,
  MyDeskScreen,
  NOTES_FOOTER,
  SCRATCH_HINT,
  TODAY_FOOTER,
} from "@/components/my-desk/my-desk-screen"
import {
  MyDeskProvider,
  STORAGE_KEY,
  initialState,
  reducer,
  saveState,
} from "@/components/my-desk/my-desk-store"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { LATE_EVENING_CT_MS } from "@/test/clock"
import { PERSISTENCE_COPY, PERSISTENCE_NOTE_NAME, RESET_DISABLED_HINT } from "@/components/persistence-note"

/** Noon Central on the day the mock was drawn, so the date chip matches it. */
const NOW_MS = new Date("2026-08-26T17:00:00.000Z").getTime()
const LATE_MS = LATE_EVENING_CT_MS

function renderScreen(nowMs = NOW_MS) {
  return render(
    <MyDeskProvider nowMs={nowMs}>
      <MyDeskScreen />
    </MyDeskProvider>
  )
}

const todayList = () => screen.getByRole("region", { name: "Today list" })
const notes = () => screen.getByRole("region", { name: "Notes" })

describe("MyDeskScreen", () => {
  it("renders the header, the lede, the shared note and chip, and Add to-do", () => {
    renderScreen()
    expect(screen.getByRole("heading", { level: 1, name: "My Desk" })).toBeInTheDocument()
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAccessibleDescription(RESET_DISABLED_HINT)
    const header = screen.getByRole("heading", { level: 1, name: "My Desk" }).closest("header")!
    expect(within(header).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(screen.getByRole("button", { name: "Add to-do" })).toBeEnabled()
  })

  it("shows Today and Notes with the mock's rows, date chip, open count and scratch", () => {
    renderScreen()
    expect(within(todayList()).getByText("Today")).toBeInTheDocument()
    expect(screen.getByTestId("today-date")).toHaveTextContent(formatDeskDate(DESK_MOCK_DAY))
    expect(screen.getByTestId("open-count")).toHaveTextContent("5")
    expect(todayList()).toHaveTextContent(TODAY_FOOTER)

    const todos = seedTodos()
    for (const todo of todos) {
      const box = screen.getByRole("checkbox", { name: todo.title })
      expect(box).toHaveAttribute("aria-checked", String(todo.done))
      expect(screen.getByText(todo.note)).toBeInTheDocument()
    }

    const done = screen.getByRole("checkbox", { name: "Text May — Dallas night" }).closest("li")!
    expect(done).toHaveAttribute("data-done", "true")
    expect(within(done).getByText("Text May — Dallas night")).toHaveClass("line-through")

    expect(within(notes()).getByRole("heading", { name: "Scratch" })).toBeInTheDocument()
    expect(screen.getByLabelText("Scratch")).toHaveValue(SEED_SCRATCH)
    expect(notes()).toHaveTextContent(NOTES_FOOTER)
    expect(notes()).toHaveTextContent(SCRATCH_HINT)
  })

  it("marks every seed row and the seed scratch as sample data; a user row does not get the tag", async () => {
    const user = userEvent.setup()
    renderScreen()
    expect(within(todayList()).getAllByTestId("sample-data-tag")).toHaveLength(7)
    expect(within(notes()).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)

    await user.click(screen.getByRole("button", { name: "Add to-do" }))
    const dialog = await screen.findByRole("dialog", { name: "Add to-do" })
    await user.type(within(dialog).getByLabelText("Title"), "Walk the dog")
    await user.click(within(dialog).getByRole("button", { name: "Add to-do" }))
    const added = screen.getByRole("checkbox", { name: "Walk the dog" }).closest("li")!
    expect(within(added).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })

  it("the Today chip is the Central day: 23:30 CT on 7 Oct still reads Wed 7 Oct", () => {
    renderScreen(LATE_MS)
    expect(screen.getByTestId("today-date")).toHaveTextContent("Wed 7 Oct")
  })

  describe("hydration", () => {
    it("shows skeletons, never the seed, until localStorage has been read", async () => {
      saveState(window.localStorage, reducer(initialState(NOW_MS), { type: "remove", id: "todo-1" }))
      const removed: Element[] = []
      const observer = new MutationObserver((records) => {
        for (const r of records) for (const n of r.removedNodes) if (n instanceof Element) removed.push(n)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      renderScreen()
      await Promise.resolve()
      observer.disconnect()

      const wasSkeleton = (el: Element) =>
        el.matches('[aria-label="Loading saved desk"]') ||
        el.querySelector('[aria-label="Loading saved desk"]') !== null
      expect(removed.some(wasSkeleton)).toBe(true)
      for (const el of removed) {
        expect(el.matches("[data-todo]") || el.querySelector("[data-todo]")).toBeFalsy()
        expect(el.textContent).not.toContain("Call Aledo")
      }
      expect(screen.queryByRole("status", { name: "Loading saved desk" })).not.toBeInTheDocument()
      expect(screen.queryByText("Call Aledo")).not.toBeInTheDocument()
      expect(todayList().querySelectorAll("[data-todo]")).toHaveLength(6)
    })
  })

  describe("add / edit / check / delete", () => {
    it("opens the add dialog on the title, caps every field, and the submit waits for a title", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add to-do" }))
      const dialog = await screen.findByRole("dialog", { name: "Add to-do" })
      const title = within(dialog).getByLabelText("Title")
      expect(title).toHaveFocus()
      expect(title).toHaveAttribute("maxlength", String(TODO_LIMITS.title))
      expect(within(dialog).getByLabelText(/Note/)).toHaveAttribute("maxlength", String(TODO_LIMITS.note))
      const submit = within(dialog).getByRole("button", { name: "Add to-do" })
      expect(submit).toBeDisabled()
      await user.type(title, "   ")
      expect(submit).toBeDisabled()
      await user.clear(title)
      await user.type(title, "Walk the dog")
      expect(submit).toBeEnabled()
    })

    it("adds a to-do, checks it off, edits it, and the note says Saved", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Add to-do" }))
      const add = await screen.findByRole("dialog", { name: "Add to-do" })
      await user.type(within(add).getByLabelText("Title"), "Walk the dog")
      await user.type(within(add).getByLabelText(/Note/), "after clinic")
      await user.click(within(add).getByRole("button", { name: "Add to-do" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

      const box = screen.getByRole("checkbox", { name: "Walk the dog" })
      expect(box).toHaveAttribute("aria-checked", "false")
      expect(screen.getByText("after clinic")).toBeInTheDocument()
      expect(screen.getByTestId("open-count")).toHaveTextContent("6")
      expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.saved)

      await user.click(box)
      expect(box).toHaveAttribute("aria-checked", "true")
      expect(screen.getByTestId("open-count")).toHaveTextContent("5")

      await user.click(screen.getByRole("button", { name: "Edit Walk the dog" }))
      const edit = await screen.findByRole("dialog", { name: "Edit to-do" })
      expect(within(edit).getByLabelText("Title")).toHaveValue("Walk the dog")
      await user.clear(within(edit).getByLabelText("Title"))
      await user.type(within(edit).getByLabelText("Title"), "Walk the puppy")
      await user.click(within(edit).getByRole("button", { name: "Save changes" }))
      expect(screen.getByRole("checkbox", { name: "Walk the puppy" })).toBeInTheDocument()
    })

    it("delete asks first; Keep it leaves the row, Delete removes it, Undo puts it back", async () => {
      const user = userEvent.setup()
      renderScreen()
      await user.click(screen.getByRole("button", { name: "Delete Call Aledo" }))
      let dialog = await screen.findByRole("dialog", { name: "Delete this to-do?" })
      expect(dialog).toHaveTextContent("Call Aledo")
      await user.click(within(dialog).getByRole("button", { name: "Keep it" }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(screen.getByRole("checkbox", { name: "Call Aledo" })).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: "Delete Call Aledo" }))
      dialog = await screen.findByRole("dialog", { name: "Delete this to-do?" })
      await user.click(within(dialog).getByRole("button", { name: "Delete" }))
      expect(screen.queryByRole("checkbox", { name: "Call Aledo" })).not.toBeInTheDocument()
      expect(screen.getByTestId("open-count")).toHaveTextContent("4")

      await user.click(screen.getByRole("button", { name: "Undo" }))
      expect(screen.getByRole("checkbox", { name: "Call Aledo" })).toBeInTheDocument()
      expect(screen.getByTestId("open-count")).toHaveTextContent("5")
    })
  })

  describe("scratch", () => {
    it("autosaves on blur and shows a Saved status", async () => {
      const user = userEvent.setup()
      renderScreen()
      const area = screen.getByLabelText("Scratch")
      await user.clear(area)
      await user.type(area, "A personal thought.")
      await user.tab()
      expect(screen.getByTestId("scratch-status")).toHaveTextContent(/Saved/)
      expect(within(notes()).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("A personal thought.")
    })

    it("writes a dirty draft on unmount without waiting for blur or the timer", () => {
      const { unmount } = renderScreen()
      fireEvent.change(screen.getByLabelText("Scratch"), {
        target: { value: "typed then leave" },
      })
      unmount()
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("typed then leave")
    })
  })

  describe("empty states", () => {
    it("empty-state copy does not claim yesterday's items drop off", () => {
      saveState(window.localStorage, {
        ...initialState(NOW_MS),
        todos: [],
        scratch: "",
      })
      renderScreen()
      const empty = screen.getByRole("status", { name: "No to-dos" })
      expect(empty).toHaveTextContent("Nothing on the list")
      expect(empty).toHaveTextContent(EMPTY_COPY)
      expect(empty).not.toHaveTextContent(/carry over/i)
      expect(empty).not.toHaveTextContent(/Yesterday/)
    })

    it("with no to-dos, Today shows one empty state that can add", async () => {
      const user = userEvent.setup()
      saveState(window.localStorage, {
        ...initialState(NOW_MS),
        todos: [],
        scratch: "",
      })
      renderScreen()
      const empty = screen.getByRole("status", { name: "No to-dos" })
      expect(empty).toHaveTextContent("Nothing on the list")
      expect(empty).toHaveTextContent(EMPTY_COPY)
      expect(empty).not.toHaveTextContent(/carry over/i)
      expect(screen.getByTestId("open-count")).toHaveTextContent("0")
      expect(screen.getByLabelText("Scratch")).toHaveValue("")
      await user.click(within(empty).getByRole("button", { name: "Add to-do" }))
      const dialog = await screen.findByRole("dialog", { name: "Add to-do" })
      await user.type(within(dialog).getByLabelText("Title"), "First one back")
      await user.click(within(dialog).getByRole("button", { name: "Add to-do" }))
      expect(screen.queryByRole("status", { name: "No to-dos" })).not.toBeInTheDocument()
      expect(screen.getByRole("checkbox", { name: "First one back" }).closest("li")).toHaveAttribute(
        "data-todo",
        "todo-8"
      )
    })
  })

  it("Reset asks first and then puts the seed back", async () => {
    const user = userEvent.setup()
    saveState(window.localStorage, { ...initialState(NOW_MS), todos: [], scratch: "" })
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Reset" }))
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(within(dialog).getByRole("button", { name: "Reset" }))
    expect(screen.getByRole("checkbox", { name: "Call Aledo" })).toBeInTheDocument()
    expect(screen.getByLabelText("Scratch")).toHaveValue(SEED_SCRATCH)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
  })

  it("a failed save is announced and nothing claims Saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    })
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("checkbox", { name: "Call Aledo" }))
    expect(screen.getByRole("alert", { name: PERSISTENCE_NOTE_NAME })).toHaveTextContent(PERSISTENCE_COPY.failed)
    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("aria-disabled", "true")
    spy.mockRestore()
  })
})
