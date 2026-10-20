import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PAYING_NOT_CONNECTED_HINT, PayingCoachesCard } from "@/components/home/paying-coaches-tile"
import { PAYING_OVERLAP_NOTE, payingCoachesView } from "@/lib/paying-coaches"

const TZ = "America/Chicago"
const live = (counts = { appStore: 7, stripe: 2000, invoice: 9, other: 0, total: 2016 }) =>
  payingCoachesView({ status: "connected", counts, asOf: "2026-10-19T20:00:00.000Z" }, TZ)

describe("PayingCoachesCard", () => {
  it("not connected: badge, dash, one muted line, nothing reserved (Deke)", () => {
    render(<PayingCoachesCard view={payingCoachesView({ status: "not_connected" }, TZ)} />)
    const card = screen.getByRole("article", { name: "Paying coaches" })
    expect(within(card).getByTestId("not-connected")).toBeInTheDocument()
    expect(within(card).getByTestId("paying-placeholder")).toHaveTextContent("No figure")
    expect(within(card).getByTestId("paying-hint")).toHaveTextContent(PAYING_NOT_CONNECTED_HINT)
    expect(within(card).queryByTestId("paying-breakdown")).toBeNull()
    expect(within(card).queryByTestId("paying-overlap-note")).toBeNull()
    expect(card).not.toHaveClass("min-h-[124px]")
    expect(card.textContent).not.toMatch(/\d/)
  })
  it("connecting: badge and busy, rows' room kept but hidden", () => {
    render(<PayingCoachesCard view={payingCoachesView({ status: "connecting" }, TZ)} />)
    const card = screen.getByRole("article", { name: "Paying coaches" })
    expect(card).toHaveAttribute("aria-busy", "true")
    expect(within(card).getByTestId("connecting")).toBeInTheDocument()
    expect(within(card).getByTestId("paying-breakdown")).toHaveClass("invisible")
  })
  it("live: total, a tabular row per method, and the overlap note", () => {
    render(<PayingCoachesCard view={live()} />)
    expect(screen.getByTestId("paying-total")).toHaveTextContent("2,016")
    const dl = screen.getByTestId("paying-breakdown")
    expect(dl).not.toHaveAttribute("aria-hidden")
    expect(within(dl).getByText("App Store").nextSibling).toHaveTextContent("7")
    expect(within(dl).getByText("Stripe").nextSibling).toHaveTextContent("2,000")
    expect(within(dl).getByText("Invoice").nextSibling).toHaveTextContent("9")
    for (const dd of dl.querySelectorAll("dd")) expect(dd).toHaveClass("tabular-nums")
    expect(screen.getByTestId("paying-overlap-note")).toHaveTextContent(PAYING_OVERLAP_NOTE)
    expect(screen.queryByTestId("paying-updated")).toBeNull()
  })
  it("rows are inline below 1024px and stacked from lg (Deke)", () => {
    render(<PayingCoachesCard view={live()} />)
    const dl = screen.getByTestId("paying-breakdown")
    expect(dl).toHaveClass("flex", "flex-wrap", "lg:flex-col")
    // A "·" separator before every row but the first, hidden from lg.
    const seps = [...dl.querySelectorAll("[data-row] > span[aria-hidden]")]
    expect(seps).toHaveLength(2)
    for (const s of seps) expect(s).toHaveClass("lg:hidden")
  })
  it("overlapping counts: rows add to more than the total, shown as given", () => {
    render(<PayingCoachesCard view={live({ appStore: 40, stripe: 900, invoice: 60, other: 0, total: 990 })} />)
    expect(screen.getByTestId("paying-total")).toHaveTextContent("990")
    expect(screen.getByTestId("paying-overlap-note")).toBeVisible()
  })
})
