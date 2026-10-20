import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { KpiCard } from "@/components/home/kpi-strip"
import { DoorNotConnected } from "@/components/home/not-connected"

describe("Not connected cards shrink to their content (Deke, #67)", () => {
  it("a door's Not connected body never stretches or centres vertically", () => {
    render(<DoorNotConnected hint="Nothing yet." />)
    const body = screen.getByTestId("door-not-connected")
    expect(body).toHaveClass("flex-none", "self-start", "justify-start")
    expect(body).not.toHaveClass("flex-1")
    expect(body).not.toHaveClass("justify-center")
  })
  it("a Not connected KPI card is top-aligned and reserves no height", () => {
    render(<KpiCard kpi={{ id: "x", label: "Subscribers", source: "not_connected" } as never} />)
    const card = screen.getByRole("article", { name: "Subscribers" })
    expect(card).toHaveClass("self-start")
    expect(card).not.toHaveClass("min-h-[124px]")
  })
})
