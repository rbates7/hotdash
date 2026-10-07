import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import SalesOpportunitiesError from "@/app/sales-opportunities/error"
import {
  STORAGE_KEY,
  initialState,
  loadState,
  saveState,
} from "@/components/sales-opportunities/deals-store"
import { FIXED_NOW_MS } from "@/test/clock"

const boom = Object.assign(new Error("could not render"), { digest: "so-1" })

describe("Sales Opportunities error boundary", () => {
  it("Try again calls reset and leaves the saved copy", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<SalesOpportunitiesError error={boom} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("Sales Opportunities couldn’t render")
    expect(screen.getByText("ref so-1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(loadState(window.localStorage)).toEqual(initialState(FIXED_NOW_MS))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("Reset and clear saved copy clears the key then calls reset", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<SalesOpportunitiesError error={boom} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadState(window.localStorage)).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
