import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import CrmError from "@/app/crm/error"

const boom = Object.assign(new Error("could not render"), { digest: "crm-1" })

describe("CRM error boundary", () => {
  it("explains that durable data is safe and retries", async () => {
    const user = userEvent.setup()
    const reset = vi.fn()
    render(<CrmError error={boom} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("CRM couldn’t load")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "saved cases and notes are not changed"
    )
    expect(screen.getByText("ref crm-1")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
