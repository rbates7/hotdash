import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { PersistenceStore } from "@/lib/persistence"
import {
  CLEAR_COPY,
  CLEAR_DESCRIPTION,
  CONFIRM_DESTRUCTIVE,
  CONFIRM_FOOTER_BUTTON,
  PERSISTENCE_COPY,
  PERSISTENCE_NOTE_NAME,
  PersistenceNote,
  RESET_DESCRIPTION,
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
  it("uses develop's root classes when no className or resetClassName is passed", () => {
    render(<PersistenceNote store={store()} />)
    const root = screen.getByTestId("persistence-note").parentElement
    expect(root).not.toBeNull()
    const tokens = root!.className.split(/\s+/).filter(Boolean)
    expect(tokens).toEqual([
      "text-micro",
      "inline-flex",
      "items-center",
      "gap-1.5",
      "text-muted-foreground",
    ])
    expect(tokens).not.toContain("max-w-full")
    expect(tokens).not.toContain("shrink-0")
    expect(tokens).not.toContain("flex-wrap")
  })

  it("applies an optional className only when a screen passes one", () => {
    render(
      <PersistenceNote
        store={store()}
        className="max-w-full shrink-0 flex-wrap"
      />
    )
    const tokens = screen.getByTestId("persistence-note").parentElement!.className.split(/\s+/)
    expect(tokens).toEqual(expect.arrayContaining(["max-w-full", "shrink-0", "flex-wrap"]))
  })

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

  it("defaults to Reset with the demo-data wording; nothing says Clear", async () => {
    const user = userEvent.setup()
    render(<PersistenceNote store={store({ edited: true, saved: true })} />)
    const reset = screen.getByRole("button", { name: "Reset" })
    expect(reset).toHaveAttribute("title", "Discard this browser's edits and restore the demo data")
    expect(screen.queryByRole("button", { name: CLEAR_COPY.button })).not.toBeInTheDocument()
    await user.click(reset)
    const dialog = await screen.findByRole("dialog", { name: "Reset demo data?" })
    expect(dialog).toHaveAccessibleDescription(RESET_DESCRIPTION)
    expect(within(dialog).getByRole("button", { name: "Reset" })).toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: CLEAR_COPY.confirm })).not.toBeInTheDocument()
  })
})

describe("PersistenceNote mode=\"clear\" (screens with no sample data)", () => {
  it("labels the button Clear my entries; disabled before a save, with its own hint", async () => {
    const user = userEvent.setup()
    render(<PersistenceNote store={store()} mode="clear" />)
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
    const clear = screen.getByRole("button", { name: "Clear my entries" })
    expect(clear).toHaveAttribute("aria-disabled", "true")
    expect(clear).toHaveAccessibleDescription(CLEAR_COPY.disabledHint)
    expect(clear).toHaveAttribute("title", CLEAR_COPY.disabledHint)
    expect(CLEAR_COPY.disabledHint).not.toBe(RESET_DISABLED_HINT)
    await user.tab()
    expect(clear).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("once saved: enabled, no hint, and the tooltip says what it discards", () => {
    render(<PersistenceNote store={store({ edited: true, saved: true })} mode="clear" />)
    const clear = screen.getByRole("button", { name: "Clear my entries" })
    expect(clear).toBeEnabled()
    expect(clear).not.toHaveAttribute("aria-describedby")
    expect(clear).toHaveAttribute("title", CLEAR_COPY.tooltip)
  })

  it("asks 'Clear my entries?' with its own description; Keep my edits cancels, Clear clears", async () => {
    const user = userEvent.setup()
    const s = store({ edited: true, saved: true })
    render(<PersistenceNote store={s} mode="clear" resetClassName="max-xl:h-11!" />)
    expect(screen.getByRole("button", { name: "Clear my entries" }).className.split(" ")).toContain("max-xl:h-11!")
    await user.click(screen.getByRole("button", { name: "Clear my entries" }))
    let dialog = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    expect(dialog).toHaveAccessibleDescription(CLEAR_DESCRIPTION)
    expect(within(dialog).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Keep my edits" }))
    expect(s.resetDemoData).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Clear my entries" }))
    dialog = await screen.findByRole("dialog", { name: "Clear my entries?" })
    await user.click(within(dialog).getByRole("button", { name: "Clear" }))
    expect(s.resetDemoData).toHaveBeenCalledTimes(1)
    expect(dialog).not.toBeInTheDocument()
  })

  it("the confirm's footer: both buttons are 44px below 1280, and the red Clear reads in the text-safe danger token", async () => {
    const user = userEvent.setup()
    render(<PersistenceNote store={store({ edited: true, saved: true })} mode="clear" />)
    await user.click(screen.getByRole("button", { name: "Clear my entries" }))
    const dialog = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    const keep = within(dialog).getByRole("button", { name: "Keep my edits" })
    const clear = within(dialog).getByRole("button", { name: CLEAR_COPY.confirm })
    for (const b of [keep, clear]) expect(b).toHaveClass(...CONFIRM_FOOTER_BUTTON.split(" "))
    expect(CONFIRM_FOOTER_BUTTON).toContain("max-xl:h-11!")
    // Nova's text-destructive on its 10% tint is ~3.96:1 (light); --danger-text is ~5.7:1 light, ~7.2:1 dark.
    expect(clear).toHaveClass(CONFIRM_DESTRUCTIVE)
    expect(CONFIRM_DESTRUCTIVE).toBe("text-danger-text!")
  })

  it("a screen's own resetDescription still wins in clear mode", async () => {
    const user = userEvent.setup()
    render(<PersistenceNote store={store({ edited: true, saved: true })} mode="clear" resetDescription="Only the CRM." />)
    await user.click(screen.getByRole("button", { name: "Clear my entries" }))
    expect(await screen.findByRole("dialog", { name: CLEAR_COPY.title })).toHaveAccessibleDescription("Only the CRM.")
  })
})
