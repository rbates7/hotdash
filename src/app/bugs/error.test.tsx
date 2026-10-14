import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { STORAGE_KEY } from "@/components/agent-workplace/issues-store"
import BugsError from "@/app/bugs/error"

describe("Bugs error boundary", () => {
  it("says the page couldn’t render, Try again calls reset, and Reset clears the Workplace key", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    window.localStorage.setItem(STORAGE_KEY, '{"stale":true}')

    render(<BugsError error={Object.assign(new Error("boom"), { digest: "abc" })} reset={reset} />)

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Bugs couldn’t render" })).toBeInTheDocument()
    expect(alert).toHaveTextContent(/share a key/)

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{"stale":true}')

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(STORAGE_KEY).toBe("hotdash.agent-workplace.v2")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(reset).toHaveBeenCalledTimes(2)
  })
})
