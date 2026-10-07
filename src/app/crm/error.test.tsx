import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import CrmError from "@/app/crm/error"
import { STORAGE_KEY, initialState, loadState, saveState } from "@/components/crm/crm-store"
import { FIXED_NOW_MS } from "@/test/clock"

const boom = Object.assign(new Error("could not render"), { digest: "crm-1" })

describe("CRM error boundary", () => {
  it("Try again calls reset and leaves the saved copy", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<CrmError error={boom} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("CRM couldn’t render")
    expect(screen.getByText("ref crm-1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(loadState(window.localStorage)).toEqual(initialState(FIXED_NOW_MS))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("Reset and clear saved copy clears the key then calls reset", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    saveState(window.localStorage, initialState(FIXED_NOW_MS))
    render(<CrmError error={boom} reset={reset} />)

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadState(window.localStorage)).toBeNull()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
