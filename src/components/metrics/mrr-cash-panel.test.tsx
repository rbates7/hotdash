import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CASH_LAST_WEEK_BAR, CASH_THIS_WEEK_BAR, MrrCashPanelView } from "@/components/metrics/mrr-cash-panel"
import { lastUpdatedLabel } from "@/lib/live-metrics"
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
    // The shared label, not a copy of it.
    expect(screen.getByTestId("mrr-cash-updated")).toHaveTextContent(lastUpdatedLabel(new Date("2026-10-14T17:00:00.000Z"), CT))
  })

  it("labels this month's partial bar 'so far' under the chart, and not a whole month", () => {
    const { rerender } = render(<MrrCashPanelView state={LIVE} timeZone={CT} />)
    expect(screen.getByTestId("mrr-axis-last")).toHaveTextContent(/^Oct so far$/)
    if (LIVE.kind !== "live") throw new Error("fixture")
    const whole = LIVE.mrr.points.map((p) => ({ ...p, partial: false }))
    rerender(<MrrCashPanelView state={{ ...LIVE, mrr: { points: whole } }} timeZone={CT} />)
    expect(screen.getByTestId("mrr-axis-last")).toHaveTextContent(/^Oct$/)
  })

  it("keeps the cash total together on one line ('$4,322 / $3,900')", () => {
    render(<MrrCashPanelView state={LIVE} timeZone={CT} />)
    const total = screen.getByTestId("cash-week-total")
    expect(total).toHaveTextContent("$4,322 / $3,900")
    expect(total).toHaveClass("whitespace-nowrap", "shrink-0")
    expect(screen.getByTestId("cash-week-value")).toHaveTextContent("$4,322")
    expect(screen.getByTestId("cash-week-previous")).toHaveTextContent("$3,900")
    expect(screen.getByTestId("mrr-chart-latest")).toHaveClass("whitespace-nowrap")
  })

  it("says the MRR history uses today's prices", () => {
    render(<MrrCashPanelView state={LIVE} timeZone={CT} />)
    expect(screen.getByTestId("mrr-chart-caption")).toHaveTextContent("MRR · 3 months · USD, past months at today's prices")
  })

  it("names both cash series in a legend, and paints last week in a full-strength token", () => {
    render(<MrrCashPanelView state={LIVE} timeZone={CT} />)
    const legend = screen.getByTestId("cash-legend")
    expect(legend).toHaveTextContent("This week")
    expect(legend).toHaveTextContent("Last week")
    expect(CASH_LAST_WEEK_BAR).toBe("bg-muted-foreground")
    expect(CASH_THIS_WEEK_BAR).toBe("bg-primary")
    const lastWeek = screen.getAllByTestId("cash-bar-last-week")
    expect(lastWeek).toHaveLength(7)
    for (const bar of lastWeek) {
      expect(bar).toHaveClass("bg-muted-foreground")
      // No translucent tint (the old bg-muted-foreground/30 was about 1.5:1).
      expect(bar.className).not.toMatch(/bg-muted-foreground\//)
    }
    expect(screen.getByTestId("cash-legend-last-week")).toHaveClass(CASH_LAST_WEEK_BAR)
    expect(screen.getByTestId("cash-legend-this-week")).toHaveClass(CASH_THIS_WEEK_BAR)
    for (const bar of screen.getAllByTestId("cash-bar-this-week")) expect(bar).toHaveClass(CASH_THIS_WEEK_BAR)
  })
})
