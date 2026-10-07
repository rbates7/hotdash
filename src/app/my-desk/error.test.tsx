import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import MyDeskError from "@/app/my-desk/error"
import {
  STORAGE_KEY,
  initialState,
  loadState,
  saveState,
} from "@/components/my-desk/my-desk-store"
import { FIXED_NOW_MS } from "@/test/clock"

const boom = Object.assign(new Error("could not render"), { digest: "desk-1" })

describe("My Desk error boundary", () => {
  it("Try again calls reset and leaves the saved copy", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<MyDeskError error={boom} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("My Desk couldn’t render")
    expect(screen.getByText("ref desk-1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(loadState(window.localStorage)).toEqual(initialState(FIXED_NOW_MS))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("Reset and clear saved copy clears the key then calls reset", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<MyDeskError error={boom} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadState(window.localStorage)).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
