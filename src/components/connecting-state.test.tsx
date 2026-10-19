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
import {
  APP_STORE_CONNECTING_NOTE,
  OTHER_CARDS_TEXT,
  STRIPE_CARDS_CONNECTING_TEXT,
  STRIPE_CONNECTING_TEXT,
  MetricsSampleNotice,
} from "@/components/metrics/metrics-sample-notice"
import { SEEDED_SCREENS, SettingsScreen, sampleDataSummary } from "@/components/settings/settings-screen"

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
      expect(within(kpi(name)).getByTestId("kpi-placeholder")).toHaveTextContent("–Loading")
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    expect(ticker()).toHaveAttribute("data-state", "loading")
    expect(within(ticker()).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(strip()).queryByTestId("kpi-sample-label")).toBeNull()
  })

  it("Home: the Stripe-fed cards, ticker and MRR door say Connecting…, never Not connected", () => {
    renderHome()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(within(kpi(name)).getByTestId("connecting")).toHaveTextContent("Connecting…")
      expect(within(kpi(name)).queryByTestId("not-connected")).toBeNull()
    }
    expect(within(ticker()).getByTestId("connecting")).toHaveTextContent("Connecting…")
    const door = screen.getByRole("region", { name: "Metrics" })
    expect(within(door).getByTestId("connecting")).toBeInTheDocument()
    expect(within(door).getByText("First sync in progress; MRR appears when it finishes.")).toBeInTheDocument()
    expect(within(door).queryByTestId("not-connected")).toBeNull()
    expect(within(door).queryByRole("img")).toBeNull()
  })

  it("Metrics: the Stripe cards are placeholders, not sample", () => {
    navigation.params = new URLSearchParams()
    render(
      <MetricsProvider nowMs={FIXED_NOW_MS}>
        <header data-testid="metrics-header" />
        <MetricsSampleNotice />
        <MetricsTabs />
      </MetricsProvider>
    )
    for (const name of [/^MRR/, /^Churn Rate/, /^Trial Conversions/, /^Subscribers/]) {
      expect(within(card(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    // The page notice is its own Connecting state; no header chip, nothing "illustrative".
    const note = screen.getByTestId("metrics-connection-notice")
    expect(note).toHaveAttribute("aria-label", "Connecting")
    expect(note).toHaveTextContent(`Connecting. ${STRIPE_CONNECTING_TEXT}. PostHog is not connected yet. ${OTHER_CARDS_TEXT}`)
    expect(note).not.toHaveTextContent(/nothing is connected|illustrative|sample/i)
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
    expect(within(kpi("Subscribers")).getByTestId("connecting")).toBeInTheDocument()
    expect(ticker()).toHaveAttribute("data-state", "loading")
    expect(within(ticker()).getByTestId("connecting")).toBeInTheDocument()
    expect(within(kpi("Cash this week")).getByText("$4,322")).toBeInTheDocument()
    expect(within(kpi("Cash this week")).queryByTestId("connecting")).toBeNull()
  })

  it("the Metrics notice does not claim App Store payers are counted", () => {
    render(<MetricsSampleNotice />)
    expect(screen.getByRole("note")).not.toHaveTextContent("also counts App Store payers")
    expect(screen.getByRole("note")).toHaveTextContent(APP_STORE_CONNECTING_NOTE)
  })

  it("with PostHog live too: PostHog's wording stays, App Store is not claimed", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    render(<MetricsSampleNotice />)
    const note = screen.getByRole("note")
    expect(note).toHaveTextContent("Retention and Active Users are live from PostHog")
    expect(note).toHaveTextContent("MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe")
    expect(note).not.toHaveTextContent("also counts App Store payers")
    expect(note).toHaveTextContent(APP_STORE_CONNECTING_NOTE)
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

const notice = () => screen.getByTestId("metrics-connection-notice")
const sampleSection = () => screen.getByRole("region", { name: "Sample data" })
const REST = `Home and Metrics show no invented figures (a card with no source says Not connected). Still built on seed rows: ${SEEDED_SCREENS.join(", ")}.`

function renderMetricsHeader() {
  return render(
    <>
      <header data-testid="metrics-header" />
      <MetricsSampleNotice />
    </>
  )
}

describe("page-level wording: Stripe connecting, PostHog not connected", () => {
  beforeEach(() => setStripeSummaryForTest(connectingSummary()))

  it("Metrics notice says Stripe is connecting, never 'Nothing is connected'; the header chip goes", () => {
    renderMetricsHeader()
    expect(notice()).toHaveAttribute("aria-label", "Connecting")
    expect(notice()).toHaveTextContent(STRIPE_CONNECTING_TEXT)
    expect(notice()).toHaveTextContent("PostHog is not connected yet")
    expect(notice()).not.toHaveTextContent(/illustrative|sample/i)
    expect(notice()).not.toHaveTextContent(/nothing is connected/i)
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("Settings › Sample data says Stripe is connecting, never 'Nothing is connected'", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent(`Stripe is connecting (first sync in progress); its cards say Connecting\u2026 until then. ${REST}`)
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
    expect(notice()).toHaveTextContent(STRIPE_CARDS_CONNECTING_TEXT)
    expect(notice()).not.toHaveTextContent("Stripe and Supabase are not connected yet")
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("Settings › Sample data: PostHog live, Stripe connecting", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent(`PostHog's figures are live and carry no label. Stripe is connecting (first sync in progress). ${REST}`)
  })
})

describe("page-level wording: Stripe live, App Store connecting", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_CONNECTING)))

  it("Metrics notice keeps the Stripe wording, says App Store is on its first read, and does not say Supabase is not connected", () => {
    renderMetricsHeader()
    expect(notice()).toHaveTextContent("MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe")
    expect(notice()).toHaveTextContent(APP_STORE_CONNECTING_NOTE)
    expect(notice()).not.toHaveTextContent("also counts App Store payers")
  })

  it("Settings › Sample data says App Store is connecting", () => {
    render(<SettingsScreen />)
    expect(sampleSection()).toHaveTextContent("Stripe's figures are live and carry no label. App Store payers from Chlk’s database are connecting")
  })
})

describe("page-level wording unchanged when live or not connected", () => {
  it("no key: the notice says Not connected, no card has a figure, and there is no Sample chip", () => {
    renderMetricsHeader()
    expect(notice()).toHaveAttribute("aria-label", "Not connected")
    expect(notice()).toHaveTextContent("Stripe, PostHog and Chlk’s database are not connected yet, so no card has a figure")
    expect(notice()).not.toHaveTextContent(/illustrative|sample/i)
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("Stripe + App Store live: #48's wording, no connecting text", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    renderMetricsHeader()
    expect(notice()).toHaveTextContent("Subscribers also counts App Store payers from Chlk’s database (read-only)")
    expect(notice()).toHaveTextContent(OTHER_CARDS_TEXT)
    expect(notice()).not.toHaveTextContent(/connecting/i)
  })

  it("sampleDataSummary covers every case: what is live, what is connecting, never 'every number is sample'", () => {
    const base = { stripe: false, posthog: false, stripeConnecting: false, appStoreConnecting: false }
    expect(sampleDataSummary(base)).toBe(`Nothing is connected yet. ${REST}`)
    expect(sampleDataSummary({ ...base, stripe: true })).toBe(`Stripe's figures are live and carry no label. ${REST}`)
    expect(sampleDataSummary({ ...base, stripe: true, posthog: true })).toBe(
      `Stripe's and PostHog's figures are live and carry no label. ${REST}`
    )
    expect(sampleDataSummary({ ...base, stripeConnecting: true })).toBe(
      `Stripe is connecting (first sync in progress); its cards say Connecting\u2026 until then. ${REST}`
    )
    expect(sampleDataSummary({ ...base, posthog: true, stripeConnecting: true })).toBe(
      `PostHog's figures are live and carry no label. Stripe is connecting (first sync in progress). ${REST}`
    )
    expect(sampleDataSummary({ ...base, stripe: true, appStoreConnecting: true })).toBe(
      `Stripe's figures are live and carry no label. App Store payers from Chlk\u2019s database are connecting, first read in progress. ${REST}`
    )
    expect(sampleDataSummary({ ...base, gmail: true })).toBe(`The CRM's Gmail conversations are live and carry no label. ${REST}`)
    expect(sampleDataSummary({ ...base, stripe: true, posthog: true, gmail: true })).toBe(
      `Stripe's and PostHog's figures and the CRM's Gmail conversations are live and carry no label. ${REST}`
    )
    expect(sampleDataSummary({ ...base, gmail: true, stripeConnecting: true })).toBe(
      `The CRM's Gmail conversations are live and carry no label. Stripe is connecting (first sync in progress). ${REST}`
    )
    for (const flags of [base, { ...base, stripe: true }, { ...base, stripeConnecting: true }]) {
      expect(sampleDataSummary(flags)).not.toMatch(/every (other )?number/i)
    }
    // Only screens that still have seed rows are named: not Home, Metrics
    // (Expenses starts empty), System Status (seeded checks are a preview)
    // or the Product Roadmap (Notion, or an empty Not connected board).
    for (const name of ["Home", "Metrics", "Expenses", "System Status", "Product Roadmap"]) {
      expect(SEEDED_SCREENS as readonly string[]).not.toContain(name)
    }

    // Notion feeds the Product Roadmap (bets, not numbers): its own sentence.
    const ROADMAP_LIVE = "The Product Roadmap is read from Notion."
    const ROADMAP_CONNECTING =
      "Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then."
    expect(sampleDataSummary({ ...base, notion: true })).toBe(`${ROADMAP_LIVE} ${REST}`)
    expect(sampleDataSummary({ ...base, stripe: true, notion: true })).toBe(
      `Stripe's figures are live and carry no label. ${ROADMAP_LIVE} ${REST}`
    )
    expect(sampleDataSummary({ ...base, notionConnecting: true })).toBe(`${ROADMAP_CONNECTING} ${REST}`)
    expect(sampleDataSummary({ ...base, posthog: true, notionConnecting: true })).toBe(
      `PostHog's figures are live and carry no label. ${ROADMAP_CONNECTING} ${REST}`
    )
    expect(sampleDataSummary({ ...base, stripeConnecting: true, notion: true })).toBe(
      `Stripe is connecting (first sync in progress); its cards say Connecting\u2026 until then. ${ROADMAP_LIVE} ${REST}`
    )
    // Gmail live with Notion (#46 × #45).
    expect(sampleDataSummary({ ...base, notion: true, gmail: true })).toBe(
      `The CRM's Gmail conversations are live and carry no label. ${ROADMAP_LIVE} ${REST}`
    )
    expect(sampleDataSummary({ ...base, notionConnecting: true, gmail: true })).toBe(
      `The CRM's Gmail conversations are live and carry no label. ${ROADMAP_CONNECTING} ${REST}`
    )
    for (const flags of [{ ...base, notion: true }, { ...base, notionConnecting: true }]) {
      expect(sampleDataSummary(flags)).not.toMatch(/sample data|every (other )?number/i)
    }
  })
})
