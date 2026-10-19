import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import { setPosthogSummaryForTest } from "@/test/posthog"
import { livePosthogSummary } from "@/test/posthog-fixture"
import { setStripeSummaryForTest } from "@/test/stripe"
import { APP_STORE_CONNECTING, LIVE_METRICS, connectingSummary, liveSummary } from "@/test/stripe-fixture"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { MetricsHeaderSampleTag, MetricsSampleNotice } from "@/components/metrics/metrics-sample-notice"
import { SettingsScreen } from "@/components/settings/settings-screen"

/**
 * The server has a key but its first sync is still running: every
 * Stripe-fed surface is a placeholder, never the sample figures as if live.
 */

const nativeMatchMedia = window.matchMedia
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})
afterEach(() => {
  window.matchMedia = nativeMatchMedia
})

const strip = () => screen.getByRole("region", { name: "KPI strip" })
const kpi = (name: string) => within(strip()).getByRole("article", { name })
const card = (name: RegExp) => within(screen.getByRole("region", { name: "Metric cards" })).getByRole("article", { name })
const ticker = () => screen.getByTestId("subscriber-ticker")
const row = (name: string) =>
  within(screen.getByRole("region", { name: "Connected data" })).getByRole("listitem", { name })

function renderHome() {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <HomeScreen />
    </IssuesProvider>
  )
}

describe("Stripe connecting", () => {
  beforeEach(() => setStripeSummaryForTest(connectingSummary()))

  it("Home: the headline, Cash this week and the ticker are placeholders — no sample number, no label", () => {
    renderHome()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(kpi(name)).toHaveAttribute("aria-busy", "true")
      expect(kpi(name)).toHaveAttribute("data-source", "loading")
      expect(within(kpi(name)).getByLabelText("Loading")).toHaveTextContent("–")
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    expect(ticker()).toHaveAttribute("data-state", "loading")
    expect(within(ticker()).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(strip()).queryByTestId("kpi-sample-label")).toBeNull()
  })

  it("Metrics: the Stripe cards are placeholders, not sample", () => {
    navigation.params = new URLSearchParams()
    render(
      <MetricsProvider nowMs={FIXED_NOW_MS}>
        <header data-testid="metrics-header">
          <MetricsHeaderSampleTag />
        </header>
        <MetricsSampleNotice />
        <MetricsTabs />
      </MetricsProvider>
    )
    for (const name of [/^MRR/, /^Churn Rate/, /^Trial Conversions/, /^Subscribers/]) {
      expect(within(card(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
  })

  it("Settings: Stripe says Connecting… and that its first sync is running — not Not connected", () => {
    render(<SettingsScreen />)
    expect(within(row("Stripe")).getByTestId("stripe-status")).toHaveTextContent("Connecting…")
    expect(within(row("Stripe")).getByTestId("stripe-status")).toHaveAttribute("aria-busy", "true")
    expect(within(row("Stripe")).getByTestId("stripe-detail")).toHaveTextContent("first sync in progress")
    expect(row("Stripe")).not.toHaveTextContent("Not connected")
  })
})

describe("Stripe live, App Store still connecting", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING)))

  it("the headline and ticker wait for the App Store group; Cash this week is live", () => {
    renderHome()
    expect(kpi("Subscribers")).toHaveAttribute("data-source", "loading")
    expect(ticker()).toHaveAttribute("data-state", "loading")
    expect(within(kpi("Cash this week")).getByText("$4,322")).toBeInTheDocument()
  })

  it("the Metrics notice does not claim App Store payers are counted", () => {
    render(<MetricsSampleNotice />)
    expect(screen.getByRole("note")).not.toHaveTextContent("also counts App Store payers")
    expect(screen.getByRole("note")).toHaveTextContent("Supabase and PostHog are not connected yet")
  })

  it("with PostHog live too: PostHog's wording stays, App Store is not claimed", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    render(<MetricsSampleNotice />)
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("Retention and Active Users are live from PostHog")
    expect(note).toHaveTextContent("MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe")
    expect(note).not.toHaveTextContent("also counts App Store payers")
    expect(note).toHaveTextContent("Supabase is not connected yet")
  })
})

describe("No key at all", () => {
  it("is still the honest Not connected, with the labelled sample", () => {
    render(<SettingsScreen />)
    expect(row("Stripe")).toHaveTextContent("Not connected")
    expect(within(row("Stripe")).queryByTestId("stripe-detail")).toBeNull()
  })
})
