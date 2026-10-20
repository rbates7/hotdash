import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { KpiCard } from "@/components/home/kpi-strip"
import { CASH_NOTE, MRR_NOTE } from "@/lib/live-metrics"

describe("money fine print", () => {
  it("Cash this week says it is gross, before refunds", () => {
    render(<KpiCard kpi={{ id: "cash-this-week", label: "Cash this week", value: "$1", delta: "", direction: "flat", source: "stripe" }} />)
    expect(screen.getByTestId("kpi-note")).toHaveTextContent(CASH_NOTE)
    expect(CASH_NOTE).toMatch(/gross.*before refunds/i)
  })
  it("MRR says USD only and that past points use today's prices", () => {
    render(<KpiCard kpi={{ id: "mrr", label: "MRR", value: "$1", delta: "", direction: "flat", source: "stripe" }} />)
    expect(screen.getByTestId("kpi-note")).toHaveTextContent(MRR_NOTE)
    expect(MRR_NOTE).toMatch(/USD only/)
    expect(MRR_NOTE).toMatch(/past points use today/)
  })
  it("MRR's note is hidden while loading, and not rendered when Not connected (Deke, #67)", () => {
    const { unmount } = render(
      <KpiCard kpi={{ id: "mrr", label: "MRR", value: "\u2014", delta: "", direction: "flat", source: "loading", connecting: true }} />
    )
    const note = screen.getByTestId("kpi-note")
    expect(note).toHaveAttribute("aria-hidden", "true")
    expect(note).toHaveClass("invisible")
    unmount()
    render(<KpiCard kpi={{ id: "mrr", label: "MRR", value: "\u2014", delta: "", direction: "flat", source: "not_connected" }} />)
    expect(screen.queryByTestId("kpi-note")).toBeNull()
    expect(screen.getByTestId("kpi-not-connected-hint")).toHaveTextContent("Connect Stripe to see this")
    expect(screen.getByRole("article", { name: "MRR" })).not.toHaveClass("min-h-[124px]")
  })
})
