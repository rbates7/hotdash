import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { MyDeskScreen } from "@/components/my-desk/my-desk-screen"
import { MyDeskProvider, STORAGE_KEY, initialState, saveState } from "@/components/my-desk/my-desk-store"

const NOW_MS = new Date("2026-08-26T17:00:00.000Z").getTime()

function renderScreen() {
  return render(
    <MyDeskProvider nowMs={NOW_MS}>
      <MyDeskScreen />
    </MyDeskProvider>
  )
}

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY)
})

describe("MyDeskScreen responsive hooks", () => {
  it("passes the 44px-below-1280 Reset through the shared resetClassName", () => {
    renderScreen()
    expect(screen.getByRole("button", { name: "Reset" }).className).toContain("max-xl:h-11!")
    expect(screen.getByRole("button", { name: "Reset" }).className).toContain("max-xl:min-w-11!")
  })

  it("keeps develop's Add to-do sizing and grows it only below xl", () => {
    renderScreen()
    const add = screen.getByRole("button", { name: "Add to-do" })
    expect(add.className).toContain("h-9")
    expect(add.className).toContain("px-3.5")
    expect(add.className).toContain("max-xl:h-11!")
    expect(add.className).toContain("max-md:absolute")
  })

  it("stacks the panes below 1280 and cards the rows; phone open is md:hidden", () => {
    renderScreen()
    expect(screen.getByRole("region", { name: "Today list" }).parentElement?.className).toContain(
      "xl:grid-cols-2"
    )
    expect(screen.getByRole("region", { name: "Today list" }).parentElement?.className).not.toContain(
      "lg:grid-cols-2"
    )
    const row = screen.getByRole("checkbox", { name: "Call Aledo" }).closest("li")!
    expect(row.className).toContain("max-xl:rounded-xl")
    expect(row.className).toContain("max-xl:overflow-hidden")
    expect(screen.getByRole("checkbox", { name: "Call Aledo" }).className).toContain("max-xl:size-11!")
    expect(screen.getByRole("checkbox", { name: "Call Aledo" }).className).toContain(
      "max-xl:focus-visible:ring-inset"
    )
    expect(screen.getByRole("button", { name: "Open Call Aledo" }).className).toContain("md:hidden")
    expect(screen.getByRole("button", { name: "Open Call Aledo" }).className).toContain("size-11!")
    expect(screen.getByRole("button", { name: "Delete Call Aledo" }).className).toContain(
      "max-xl:text-danger-text!"
    )
  })

  it("does not duplicate the title in the checkbox name; carry stays a description", () => {
    renderScreen()
    const box = screen.getByRole("checkbox", { name: "Call Aledo" })
    expect(box).toHaveAccessibleName("Call Aledo")
    const title = within(box.closest("li")!).getByText("Call Aledo")
    expect(title).toHaveAttribute("aria-hidden", "true")
  })

  it("grows the add/edit dialog × and the note textarea only below xl", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Add to-do" }))
    const dialog = await screen.findByRole("dialog", { name: "Add to-do" })
    expect(dialog.className).toContain("max-xl:[&>[data-slot=dialog-close]]:size-11!")
    const note = within(dialog).getByLabelText(/Note/)
    expect(note).toHaveAttribute("rows", "2")
    expect(note.className).toContain("min-h-9")
    expect(note.className).toContain("max-xl:field-sizing-content")
    expect(note.className).toContain("max-xl:min-h-24!")
    expect(note.className).not.toMatch(/(?:^|\s)h-\d/)
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
  })

  it("keeps the scratch rows on desktop and only adds a min-height below xl", () => {
    renderScreen()
    const scratch = screen.getByLabelText("Scratch")
    expect(scratch.className).toContain("min-h-[220px]")
    expect(scratch.className).toContain("max-xl:field-sizing-content")
    expect(scratch.className).toContain("max-xl:min-h-24!")
    expect(scratch.className).toContain("max-xl:focus-visible:ring-inset")
  })

  it("after delete, focus moves to the next checkbox", async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Delete Call Aledo" }))
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete this to-do?" })).getByRole("button", {
        name: "Delete",
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "Call Aledo" })).not.toBeInTheDocument()
    )
    expect(screen.getByRole("checkbox", { name: "Clinic follow-up" })).toHaveFocus()
  })

  it("after deleting the last row, focus moves to the heading", async () => {
    saveState(window.localStorage, {
      ...initialState(NOW_MS),
      todos: [
        {
          id: "todo-20",
          title: "Only one",
          note: "",
          done: false,
          createdOn: "2026-08-26",
          doneOn: null,
        },
      ],
      nextId: 21,
      scratch: "",
    })
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole("button", { name: "Delete Only one" }))
    await user.click(
      within(screen.getByRole("dialog", { name: "Delete this to-do?" })).getByRole("button", {
        name: "Delete",
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "Only one" })).not.toBeInTheDocument()
    )
    expect(screen.getByRole("heading", { level: 1, name: "My Desk" })).toHaveFocus()
  })
})
