import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PayingCoachesCard } from "@/components/home/paying-coaches-tile"
import { payingCoachesView } from "@/lib/paying-coaches"

const TZ = "America/Chicago"

describe("PayingCoachesCard", () => {
  it("not connected: badge, no figures", () => {
    render(<PayingCoachesCard view={payingCoachesView({ status: "not_connected" }, TZ)} />)
    const card = screen.getByRole("article", { name: "Paying coaches" })
    expect(within(card).getByTestId("not-connected")).toBeInTheDocument()
    expect(within(card).getByTestId("paying-placeholder")).toHaveTextContent("No figure")
    expect(card.textContent).not.toMatch(/\d/)
  })
  it("connecting: badge and busy", () => {
    render(<PayingCoachesCard view={payingCoachesView({ status: "connecting" }, TZ)} />)
    const card = screen.getByRole("article", { name: "Paying coaches" })
    expect(card).toHaveAttribute("aria-busy", "true")
    expect(within(card).getByTestId("connecting")).toBeInTheDocument()
  })
  it("live: total and a row per method", () => {
    render(
      <PayingCoachesCard
        view={payingCoachesView({ status: "connected", counts: { appStore: 7, stripe: 2000, invoice: 9, other: 0, total: 2016 }, asOf: "2026-10-19T20:00:00.000Z" }, TZ)}
      />
    )
    expect(screen.getByTestId("paying-total")).toHaveTextContent("2,016")
    const dl = screen.getByTestId("paying-breakdown")
    expect(dl).not.toHaveAttribute("aria-hidden")
    expect(within(dl).getByText("App Store").nextSibling).toHaveTextContent("7")
    expect(within(dl).getByText("Stripe").nextSibling).toHaveTextContent("2,000")
    expect(within(dl).getByText("Invoice").nextSibling).toHaveTextContent("9")
    expect(screen.queryByTestId("paying-updated")).toBeNull()
  })
})
