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
      <span data-testid="contacts">{store.contacts.map((c) => c.email).join("|")}</span>
      <button type="button" onClick={() => store.addContact({ email: "tom@example.com", firstName: "Tom" })}>
        edit
      </button>
      <button type="button" onClick={() => setCrash(true)}>
        crash
      </button>
    </div>
  )
}

describe("CRM client error boundary", () => {
  it("shows the CRM alert for a throwing child; Reset clears the founder's entries and leaves the key empty", async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mine = reducer(initialState(NOW), {
      type: "add-contact",
      input: { email: "pat@example.org", firstName: "Pat" },
      at: new Date(NOW).toISOString(),
    })
    saveState(window.localStorage, mine)

    render(
      <CrmProvider nowMs={NOW}>
        <CrmErrorBoundary>
          <Child />
        </CrmErrorBoundary>
      </CrmProvider>
    )

    expect(screen.getByTestId("contacts")).toHaveTextContent("pat@example.org")
    await user.click(screen.getByRole("button", { name: "edit" }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"tom@example.com"')

    await user.click(screen.getByRole("button", { name: "crash" }))
    expect(screen.getByRole("alert")).toHaveTextContent("CRM couldn’t render")
    expect(screen.getByRole("alert")).toHaveTextContent("starts the CRM empty")
    expect(screen.getByRole("alert")).not.toHaveTextContent(/sample/i)
    expect(screen.queryByTestId("contacts")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reset and clear saved copy" }))
    expect(screen.getByTestId("contacts")).toBeEmptyDOMElement()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    spy.mockRestore()
  })
})
