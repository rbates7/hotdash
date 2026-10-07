import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PersistenceStore } from "@/lib/persistence"
import {
  PERSISTENCE_COPY,
  PERSISTENCE_NOTE_NAME,
  PersistenceNote,
  RESET_DISABLED_HINT,
  persistenceCopy,
} from "@/components/persistence-note"

function store(over: Partial<PersistenceStore> = {}): PersistenceStore {
  return {
    persisted: true,
    edited: false,
    saved: false,
    saveFailed: false,
    resetDemoData: vi.fn(),
    ...over,
  }
}

describe("persistenceCopy", () => {
  it("says loading, then where edits will go, then saved, and never Saved after a failed write", () => {
    expect(persistenceCopy(store({ persisted: false }))).toBe(PERSISTENCE_COPY.loading)
    expect(persistenceCopy(store())).toBe(PERSISTENCE_COPY.unsaved)
    expect(persistenceCopy(store({ edited: true, saved: true }))).toBe(PERSISTENCE_COPY.saved)
    expect(persistenceCopy(store({ edited: true, saved: true, saveFailed: true }))).toBe(PERSISTENCE_COPY.failed)
    expect(persistenceCopy(store({ edited: true, saveFailed: true }))).toBe(PERSISTENCE_COPY.failed)
  })
})

describe("PersistenceNote", () => {
  it("reads 'Edits save in this browser' before the first save; Reset is disabled but reachable and explains why", async () => {
    const user = userEvent.setup()
    render(<PersistenceNote store={store()} />)
    expect(screen.getByTestId("persistence-note")).toHaveTextContent("Edits save in this browser")
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset).toHaveAttribute("aria-disabled", "true")
    expect(reset).toHaveAccessibleDescription(RESET_DISABLED_HINT)
    // No native `disabled` (it stays focusable), so the look comes from aria-disabled variants.
    for (const c of ["aria-disabled:opacity-50", "aria-disabled:cursor-not-allowed", "aria-disabled:hover:bg-transparent!", "aria-disabled:hover:text-muted-foreground!", "text-micro!", "px-1.5!"]) {
      expect(reset.className.split(" ")).toContain(c)
    }
    // Keyboard users can still land on it and hear the hint.
    await user.tab()
    expect(reset).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("accepts extra Reset classes so a screen can grow the tap target", () => {
    render(<PersistenceNote store={store()} resetClassName="max-xl:h-11!" />)
    expect(screen.getByRole("button", { name: "Reset" }).className.split(" ")).toContain("max-xl:h-11!")
  })

  it("reads 'Saved in this browser' once something is saved and enables Reset without the hint", () => {
    render(<PersistenceNote store={store({ edited: true, saved: true })} />)
    expect(screen.getByTestId("persistence-note")).toHaveTextContent("Saved in this browser")
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset).toBeEnabled()
    expect(reset).not.toHaveAttribute("aria-describedby")
  })

  it("is a named status region, and an alert of the same name once a save has failed", () => {
    const { unmount } = render(<PersistenceNote store={store({ edited: true, saved: true })} />)
    expect(screen.getByRole("status", { name: PERSISTENCE_NOTE_NAME })).toHaveTextContent("Saved in this browser")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    unmount()
    render(<PersistenceNote store={store({ edited: true, saved: true, saveFailed: true })} />)
    const note = screen.getByRole("alert", { name: PERSISTENCE_NOTE_NAME })
    expect(note).toHaveTextContent("Couldn't save in this browser")
    expect(note).not.toHaveTextContent("Saved")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("Reset asks first, and only the confirm clears", async () => {
    const user = userEvent.setup()
    const s = store({ edited: true, saved: true })
    render(<PersistenceNote store={s} />)
    await user.click(screen.getByRole("button", { name: "Reset" }))
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" })
    expect(s.resetDemoData).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Keep my edits" }))
    expect(s.resetDemoData).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset" }))
    await screen.findByRole("dialog", { name: "Reset demo data?" })
    await user.click(screen.getAllByRole("button", { name: "Reset" }).at(-1)!)
    expect(s.resetDemoData).toHaveBeenCalledTimes(1)
    expect(dialog).not.toBeInTheDocument()
  })
})
