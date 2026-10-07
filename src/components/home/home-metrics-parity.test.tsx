import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
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
describe("Home ↔ Metrics parity (rendered)", () => {
  const today = todayIn(FIXED_NOW)

  function renderMetrics(search = "") {
    navigation.params = new URLSearchParams(search)
    return render(
      <MetricsProvider today={today}>
        <MetricsTabs />
      </MetricsProvider>
    )
  }

  function renderHome() {
    return render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <HomeScreen pulse="Thursday pulse" />
      </IssuesProvider>
    )
  }

  it("the truth strip's Subscribers card shows the Metrics Subscribers card's value and delta", () => {
    const metrics = renderMetrics()
    const metricsCard = within(screen.getByRole("region", { name: "Metric cards" })).getByRole("article", { name: "Subscribers" })
    const metricsValue = within(metricsCard).getByTestId("metric-value").textContent
    const metricsTrend = within(metricsCard).getByTestId("trend").textContent
    const metricsCaption = within(metricsCard).getByText(/vs previous/).textContent
    metrics.unmount()

    renderHome()
    const homeCard = within(screen.getByRole("region", { name: "KPI strip" })).getByRole("article", { name: "Subscribers" })
    expect(within(homeCard).getByText(metricsValue!)).toBeInTheDocument()
    expect(homeCard).toHaveTextContent(`${metricsTrend} ${metricsCaption}`)
  })

  it("the Metrics door's MRR span is the Metrics MRR card's series", () => {
    const metrics = renderMetrics()
    const mrr = within(screen.getByRole("region", { name: "Metric cards" })).getByRole("article", { name: "MRR" })
    const name = within(mrr).getByRole("img").getAttribute("aria-label")!
    // "…: to 10 Apr $23,800, …, to 27 Aug $26,190"
    const values = [...name.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")))
    expect(values).toHaveLength(6)
    metrics.unmount()

    renderHome()
    const door = screen.getByRole("region", { name: "Metrics" })
    const first = `$${(values[0] / 1000).toFixed(1).replace(/\.0$/, "")}k`
    const last = `$${(values[5] / 1000).toFixed(1).replace(/\.0$/, "")}k`
    expect(within(door).getByText(new RegExp(`${first.replace("$", "\\$").replace(".", "\\.")} → ${last.replace("$", "\\$").replace(".", "\\.")}`))).toBeInTheDocument()
    expect(within(door).getByRole("img").getAttribute("aria-label")).toContain(`${first} to ${last}`)
  })

  it("every growth-set figure Home could show matches the rendered Metrics card", () => {
    const metrics = renderMetrics()
    const grid = screen.getByRole("region", { name: "Metric cards" })
    const rendered = Object.fromEntries(
      ["MRR", "ARR", "Subscribers", "Churn Rate"].map((name) => {
        const card = within(grid).getByRole("article", { name })
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
})
