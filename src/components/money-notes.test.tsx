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
})
