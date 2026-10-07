import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { CrmErrorBoundary } from "@/components/crm/crm-error-boundary"
import {
  STORAGE_KEY,
  CrmProvider,
  initialState,
  reducer,
  saveState,
  useCrm,
} from "@/components/crm/crm-store"

const NOW = FIXED_NOW_MS

function Child() {
  const store = useCrm()
  const [crash, setCrash] = React.useState(false)
  if (crash) throw new Error("could not render")
  return (
    <div>
      <span data-testid="cases">{store.cases.length}</span>
      <span data-testid="priority">{store.cases.find((c) => c.id === "case-1")?.priority}</span>
      <button type="button" onClick={() => store.setPriority("case-1", "low")}>
        edit
      </button>
      <button type="button" onClick={() => setCrash(true)}>
        crash
      </button>
    </div>
  )
}

describe("CRM client error boundary", () => {
  it("shows the CRM alert for a throwing child; Reset re-seeds and leaves the key empty", async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const edited = reducer(initialState(NOW), { type: "set-priority", id: "case-1", priority: "low" })
    saveState(window.localStorage, edited)

    render(
      <CrmProvider nowMs={NOW}>
        <CrmErrorBoundary>
          <Child />
        </CrmErrorBoundary>
      </CrmProvider>
    )

    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    await user.click(screen.getByRole("button", { name: "edit" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"low"')

    await user.click(screen.getByRole("button", { name: "crash" }))
    expect(screen.getByRole("alert")).toHaveTextContent("CRM couldn’t render")
    expect(screen.queryByTestId("cases")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(screen.getByTestId("cases")).toHaveTextContent("8")
    expect(screen.getByTestId("priority")).toHaveTextContent("high")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    spy.mockRestore()
  })
})
