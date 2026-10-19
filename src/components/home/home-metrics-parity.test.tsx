import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import { liveSummary, setStripeSummaryForTest } from "@/test/stripe"
import { todayIn } from "@/lib/clock"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"
import { KpiStrip } from "@/components/home/kpi-strip"
import { kpiSets } from "@/lib/home-fixture"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"

/**
 * Home and Metrics must show the same numbers. This compares what each
 * screen actually renders for the same day — not the fixture both read —
 * so a formatting or wiring slip on either side fails here.
 */
const nativeMatchMedia = window.matchMedia

function mockDesktop() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe("Home ↔ Metrics parity (rendered)", () => {
  const today = todayIn(FIXED_NOW)

  beforeEach(() => mockDesktop())
  afterEach(() => {
    window.matchMedia = nativeMatchMedia
  })

  function renderMetrics(search = "") {
    navigation.params = new URLSearchParams(search)
    return render(
      <MetricsProvider nowMs={Date.parse(`${today}T18:00:00.000Z`)}>
        <MetricsTabs />
      </MetricsProvider>
    )
  }

  function renderHome() {
    return render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <HomeScreen />
      </IssuesProvider>
    )
  }

  it("with Stripe not connected, Home shows no sample figure for Subscribers or MRR", () => {
    renderHome()
    const homeCard = within(screen.getByRole("region", { name: "KPI strip" })).getByRole("article", { name: "Subscribers" })
    expect(homeCard).toHaveAttribute("data-source", "not_connected")
    expect(within(screen.getByRole("region", { name: "Metrics" })).queryByRole("img")).not.toBeInTheDocument()
  })

  it("every growth-set figure Home could show matches the rendered Metrics card", () => {
    const metrics = renderMetrics()
    const grid = screen.getByRole("region", { name: "Metric cards" })
    const rendered = Object.fromEntries(
      ["MRR", "ARR", "Subscribers", "Churn Rate"].map((name) => {
        const card = within(grid).getByRole("article", { name: new RegExp(`^${name}\\b`) })
        return [name, within(card).getByTestId("metric-value").textContent]
      })
    )
    metrics.unmount()

    // The growth set is not the active strip, so render its cards directly.
    render(<KpiStrip kpis={kpiSets(today).growth} title="KPIs" />)
    for (const [name, value] of Object.entries(rendered)) {
      expect(within(screen.getByRole("article", { name })).getByText(value!)).toBeInTheDocument()
    }
  })

  it("with Stripe connected, Home's Subscribers, ticker and MRR door match the live Metrics cards", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    const metrics = renderMetrics()
    const grid = screen.getByRole("region", { name: "Metric cards" })
    const subsCard = within(grid).getByRole("article", { name: /^Subscribers\b/ })
    const subs = within(subsCard).getByTestId("metric-value").textContent
    const subsTrend = within(subsCard).getByTestId("trend").textContent
    const subsRows = within(subsCard).getByTestId("subscriber-breakdown").textContent
    const mrrName = within(within(grid).getByRole("article", { name: /^MRR\b/ })).getByRole("img").getAttribute("aria-label")!
    metrics.unmount()

    renderHome()
    const homeCard = within(screen.getByRole("region", { name: "KPI strip" })).getByRole("article", { name: "Subscribers" })
    expect(subs).toBe("1,337")
    expect(within(homeCard).getByText(subs!)).toBeInTheDocument()
    expect(homeCard).toHaveTextContent(`${subsTrend} vs previous`)
    expect(within(homeCard).getByTestId("subscriber-breakdown").textContent).toBe(subsRows)
    expect(screen.getByTestId("subscriber-ticker").querySelector(".sr-only")).toHaveTextContent(`Subscribers: ${subs}`)
    // Same six MRR points: $52,000 … $61,235 on the card, $52k → $61.2k on the door.
    expect(mrrName).toContain("$52,000")
    expect(mrrName).toContain("$61,235")
    expect(within(screen.getByRole("region", { name: "Metrics" })).getByText(/\$52k → \$61\.2k/)).toBeInTheDocument()
  })
})
