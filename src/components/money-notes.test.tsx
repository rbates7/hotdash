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
  it("MRR's note is hidden with no figure: Not connected or Connecting…", () => {
    for (const source of ["not_connected", "loading"] as const) {
      const { unmount } = render(
        <KpiCard kpi={{ id: "mrr", label: "MRR", value: "\u2014", delta: "", direction: "flat", source, connecting: source === "loading" }} />
      )
      const note = screen.getByTestId("kpi-note")
      expect(note).toHaveAttribute("aria-hidden", "true")
      expect(note).toHaveClass("invisible")
      unmount()
    }
  })
})
