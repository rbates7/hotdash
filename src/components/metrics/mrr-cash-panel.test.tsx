import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { MrrCashPanelView } from "@/components/metrics/mrr-cash-panel"
import type { MrrCashPanelState } from "@/lib/stripe-mrr-cash"

const CT = "America/Chicago"

const LIVE: MrrCashPanelState = {
  kind: "live",
  stale: false,
  lastSyncedAt: new Date("2026-10-14T17:00:00.000Z"),
  mrr: {
    points: [
      { month: "2026-08", value: 59_000, partial: false },
      { month: "2026-09", value: 60_100, partial: false },
      { month: "2026-10", value: 61_234.56, partial: true },
    ],
  },
  cash: {
    since: "2026-10-12T05:00:00.000Z",
    value: 4_321.5,
    previous: 3_900,
    days: [
      { date: "2026-10-12", value: 2_000, previous: 1_500 },
      { date: "2026-10-13", value: 1_321.5, previous: 1_400 },
      { date: "2026-10-14", value: 1_000, previous: 1_000 },
      { date: "2026-10-15", value: null, previous: null },
      { date: "2026-10-16", value: null, previous: null },
      { date: "2026-10-17", value: null, previous: null },
      { date: "2026-10-18", value: null, previous: null },
    ],
  },
}

describe("MrrCashPanelView", () => {
  it("says Stripe is connecting while the first sync runs, and no figures", () => {
    render(<MrrCashPanelView state={{ kind: "loading", connecting: true }} timeZone={CT} />)
    const panel = screen.getByTestId("mrr-cash-panel")
    expect(panel).toHaveAttribute("aria-busy", "true")
    expect(panel).toHaveAttribute("data-state", "connecting")
    expect(screen.getByRole("status")).toHaveTextContent("Stripe is connecting (first sync in progress)")
    expect(panel.textContent).not.toMatch(/\$\d/)
    expect(panel.textContent).not.toMatch(/sample/i)
  })

  it("is a bare placeholder while loading, and says Not connected with no key", () => {
    const { rerender } = render(<MrrCashPanelView state={{ kind: "loading" }} timeZone={CT} />)
    expect(screen.getByTestId("mrr-cash-panel").textContent).not.toMatch(/\$\d/)
    rerender(<MrrCashPanelView state={{ kind: "not_connected" }} timeZone={CT} />)
    expect(screen.getByRole("status")).toHaveTextContent("Stripe not connected")
    expect(screen.getByTestId("mrr-cash-panel")).toHaveAttribute("aria-busy", "false")
  })

  it("charts MRR by month and cash by day when live", () => {
    render(<MrrCashPanelView state={LIVE} timeZone={CT} />)
    expect(screen.getByTestId("mrr-chart-latest")).toHaveTextContent("$61,235")
    const bars = screen.getAllByTestId("mrr-bar")
    expect(bars.map((b) => b.dataset.month)).toEqual(["2026-08", "2026-09", "2026-10"])
    expect(bars[2]).toHaveTextContent("Oct 2026 so far: $61,235")
    expect(screen.getByTestId("cash-week-total")).toHaveTextContent("$4,322 / $3,900")
    const days = screen.getAllByTestId("cash-day")
    expect(days).toHaveLength(7)
    expect(within(days[0]).getByText(/Mon/)).toHaveTextContent("$2,000, last week $1,500")
    expect(within(days[4]).getByText(/Fri/)).toHaveTextContent("still ahead")
    expect(screen.queryByTestId("mrr-cash-updated")).toBeNull()
  })

  it("says when stale figures were last updated", () => {
    render(<MrrCashPanelView state={{ ...LIVE, stale: true }} timeZone={CT} />)
    expect(screen.getByTestId("mrr-cash-updated")).toHaveTextContent(/^Last updated /)
  })
})
