import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConnectingBadge } from "@/components/connecting-badge"

describe("ConnectingBadge", () => {
  it('says Connecting… and is aria-busy="true"', () => {
    render(<ConnectingBadge />)
    const badge = screen.getByTestId("connecting")
    expect(badge).toHaveTextContent("Connecting…")
    expect(badge).toHaveAttribute("aria-busy", "true")
  })

  it("keeps aria-busy under a source's own test id (Settings rows)", () => {
    render(<ConnectingBadge testId="stripe-status" />)
    expect(screen.getByTestId("stripe-status")).toHaveAttribute("aria-busy", "true")
  })
})
