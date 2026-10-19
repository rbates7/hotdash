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
import { SettingsScreen, sampleDataSummary } from "@/components/settings/settings-screen"

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
    // The page notice is its own Connecting state, and the header chip is hidden.
    const note = screen.getByTestId("sample-data-notice")
    expect(note).toHaveAttribute("aria-label", "Connecting")
    expect(note).toHaveTextContent(
      "Connecting. Stripe’s first sync is in progress; MRR, Churn Rate, Trial Conversions and Subscribers will appear when it finishes. Every other number on this page is illustrative"
    )
    expect(note).not.toHaveTextContent(/nothing is connected/i)
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
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
    expect(screen.getByRole("note")).toHaveTextContent("PostHog is not connected yet, and Supabase is connecting only for that count")
  })

  it("with PostHog live too: PostHog's wording stays, App Store is not claimed", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    render(<MetricsSampleNotice />)
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("Retention and Active Users are live from PostHog")
    expect(note).toHaveTextContent("MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe")
    expect(note).not.toHaveTextContent("also counts App Store payers")
    expect(note).toHaveTextContent("Supabase is connecting only for that count")
  })
})

describe("No key at all", () => {
  it("is still the honest Not connected, with the labelled sample", () => {
    render(<SettingsScreen />)
    expect(row("Stripe")).toHaveTextContent("Not connected")
    expect(within(row("Stripe")).queryByTestId("stripe-detail")).toBeNull()
  })
})

/* ------------------------------------------- page-level wording while connecting */

const notice = () => screen.getByTestId("sample-data-notice")
const sampleSection = () => screen.getByRole("region", { name: "Sample data" })

function renderMetricsHeader() {
  return render(
    <>
      <header data-testid="metrics-header">
        <MetricsHeaderSampleTag />
      </header>
      <MetricsSampleNotice />
    </>
  )
}

describe("page-level wording: Stripe connecting, PostHog not connected", () => {
  beforeEach(() => setStripeSummaryForTest(connectingSummary()))

  it("Metrics notice says Stripe is connecting, never 'Nothing is connected'; the header chip goes", () => {
    renderMetricsHeader()
    expect(notice()).toHaveAttribute("aria-label", "Connecting")
    expect(notice()).toHaveTextContent("Stripe’s first sync is in progress; MRR, Churn Rate, Trial Conversions and Subscribers will appear when it finishes")
    expect(notice()).toHaveTextContent("Every other number on this page is illustrative — PostHog is not connected yet")
    expect(notice()).not.toHaveTextContent(/nothing is connected/i)
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("Settings › Sample data says Stripe is connecting, never 'Nothing is connected'", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent(
      "Stripe is connecting (first sync in progress); its figures show a placeholder until then. Every other number is still sample data."
    )
    expect(sampleSection()).not.toHaveTextContent(/nothing is connected/i)
  })
})

describe("page-level wording: Stripe connecting, PostHog live", () => {
  beforeEach(() => {
    setStripeSummaryForTest(connectingSummary())
    setPosthogSummaryForTest(livePosthogSummary("connected"))
  })

  it("Metrics notice keeps #44's PostHog wording and adds that Stripe is connecting", () => {
    renderMetricsHeader()
    expect(notice()).toHaveAttribute("aria-label", "Partly live")
    expect(notice()).toHaveTextContent("Retention and Active Users are live from PostHog")
    expect(notice()).toHaveTextContent("the Stripe cards (MRR, Churn Rate, Trial Conversions and Subscribers) are connecting")
    expect(notice()).not.toHaveTextContent("Stripe and Supabase are not connected yet")
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("Settings › Sample data: PostHog live, Stripe connecting", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent("PostHog's figures are live and carry no label; Stripe is connecting (first sync in progress). Every other number is still sample data.")
  })
})

describe("page-level wording: Stripe live, App Store connecting", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING)))

  it("Metrics notice keeps the Stripe wording, says App Store is on its first read, and does not say Supabase is not connected", () => {
    renderMetricsHeader()
    expect(notice()).toHaveTextContent("MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe")
    expect(notice()).toHaveTextContent("Subscribers waits for App Store payers from Chlk’s database, first read in progress")
    expect(notice()).toHaveTextContent("PostHog is not connected yet, and Supabase is connecting only for that count")
    expect(notice()).not.toHaveTextContent("Supabase and PostHog are not connected yet")
  })

  it("Settings › Sample data says App Store is connecting", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent("Stripe's figures are live and carry no label; App Store payers from Chlk’s database are connecting")
  })
})

describe("page-level wording unchanged when live or not connected", () => {
  it("no key: the original 'Nothing is connected' notice, chip and Settings text", () => {
    renderMetricsHeader()
    expect(notice()).toHaveTextContent("Nothing is connected to Stripe, Supabase or PostHog yet")
    expect(within(screen.getByTestId("metrics-header")).getByTestId("sample-data-tag")).toBeInTheDocument()
  })

  it("Stripe + App Store live: #48's wording, no connecting text", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    renderMetricsHeader()
    expect(notice()).toHaveTextContent("Subscribers also counts App Store payers from Chlk’s database (read-only)")
    expect(notice()).toHaveTextContent("PostHog is not connected yet, and Supabase only for that count")
    expect(notice()).not.toHaveTextContent(/connecting/i)
  })

  it("sampleDataSummary covers every case", () => {
    const base = { stripe: false, posthog: false, stripeConnecting: false, appStoreConnecting: false }
    expect(sampleDataSummary(base)).toBe("Nothing is connected yet, so every number on every screen is sample data.")
    expect(sampleDataSummary({ ...base, stripe: true })).toBe(
      "Stripe's figures are live and carry no label; every other number is still sample data."
    )
    expect(sampleDataSummary({ ...base, stripe: true, posthog: true })).toBe(
      "Stripe's and PostHog's figures are live and carry no label; every other number is still sample data."
    )
    expect(sampleDataSummary({ ...base, stripeConnecting: true })).toBe(
      "Stripe is connecting (first sync in progress); its figures show a placeholder until then. Every other number is still sample data."
    )
    expect(sampleDataSummary({ ...base, posthog: true, stripeConnecting: true })).toBe(
      "PostHog's figures are live and carry no label; Stripe is connecting (first sync in progress). Every other number is still sample data."
    )
    expect(sampleDataSummary({ ...base, stripe: true, appStoreConnecting: true })).toBe(
      "Stripe's figures are live and carry no label; App Store payers from Chlk\u2019s database are connecting, first read in progress. Every other number is still sample data."
    )

    // Notion feeds the Product Roadmap (bets, not numbers): its own sentence.
    expect(sampleDataSummary({ ...base, notion: true })).toBe(
      "The Product Roadmap is read from Notion; every number on the other screens is still sample data."
    )
    expect(sampleDataSummary({ ...base, stripe: true, notion: true })).toBe(
      "Stripe's figures are live and carry no label; every other number is still sample data. The Product Roadmap is read from Notion."
    )
    expect(sampleDataSummary({ ...base, notionConnecting: true })).toBe(
      "Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then. Every number on the other screens is still sample data."
    )
    // Notion connecting never claims the Roadmap is sample.
    expect(sampleDataSummary({ ...base, notionConnecting: true })).not.toMatch(/every number on every screen/i)
    expect(sampleDataSummary({ ...base, notion: true })).not.toMatch(/every number on every screen/i)
    expect(sampleDataSummary({ ...base, posthog: true, notionConnecting: true })).toBe(
      "PostHog's figures are live and carry no label; every other number is still sample data. Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then."
    )
  })
})
