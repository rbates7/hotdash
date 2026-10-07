import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import CommunityDevelopmentError from "@/app/community-development/error"
import {
  STORAGE_KEY,
  initialState,
  loadState,
  saveState,
} from "@/components/community-development/community-development-store"

const boom = Object.assign(new Error("could not render"), { digest: "cd-1" })
const TODAY = "2026-10-07"

describe("Community Development error boundary", () => {
  it("Try again calls reset and leaves the saved copy", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(TODAY))
    render(<CommunityDevelopmentError error={boom} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("Community Development couldn’t render")
    expect(screen.getByText("ref cd-1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(loadState(window.localStorage)).toEqual(initialState(TODAY))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("Reset and clear saved copy clears the key then calls reset", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(TODAY))
    render(<CommunityDevelopmentError error={boom} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadState(window.localStorage)).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
