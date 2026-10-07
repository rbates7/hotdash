import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PersistenceStore } from "@/lib/persistence"
import { PERSISTENCE_COPY, PersistenceNote, persistenceCopy } from "@/components/persistence-note"

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
  it("reads 'Edits save in this browser' before the first save and disables Reset", () => {
    render(<PersistenceNote store={store()} />)
    expect(screen.getByTestId("persistence-note")).toHaveTextContent("Edits save in this browser")
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled()
  })

  it("reads 'Saved in this browser' once something is saved and enables Reset", () => {
    render(<PersistenceNote store={store({ edited: true, saved: true })} />)
    expect(screen.getByTestId("persistence-note")).toHaveTextContent("Saved in this browser")
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled()
  })

  it("announces a failed save and never says Saved", () => {
    render(<PersistenceNote store={store({ edited: true, saved: true, saveFailed: true })} />)
    const note = screen.getByRole("alert")
    expect(note).toHaveTextContent("Couldn't save in this browser")
    expect(note).not.toHaveTextContent("Saved")
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
