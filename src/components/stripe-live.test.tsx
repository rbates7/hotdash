import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailSummaryForTest } from "@/test/gmail"
import { navigation } from "@/test/setup"
import {
  APP_STORE_OFF,
  APP_STORE_STALE,
  LIVE_METRICS,
  liveSummary,
  setStripeLoadingForTest,
  setStripeSummaryForTest,
} from "@/test/stripe"
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/settings"
import { IssuesProvider } from "@/components/agent-workplace/issues-store"
import { HomeScreen } from "@/components/home/home-screen"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { MetricsHeaderSampleTag, MetricsSampleNotice } from "@/components/metrics/metrics-sample-notice"
import { SettingsScreen } from "@/components/settings/settings-screen"

/**
 * Every Stripe-fed surface in its four states. Not connected is the
 * default for every test (src/test/setup.ts) and is what the older screen
 * tests cover; these pin connected, stale and loading.
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

function renderHome() {
  return render(
    <IssuesProvider nowMs={FIXED_NOW_MS}>
      <HomeScreen />
    </IssuesProvider>
  )
}

function renderMetrics() {
  navigation.params = new URLSearchParams()
  return render(
    <MetricsProvider nowMs={FIXED_NOW_MS}>
      <header data-testid="metrics-header">
        <MetricsHeaderSampleTag />
      </header>
      <MetricsSampleNotice />
      <MetricsTabs />
    </MetricsProvider>
  )
}

const strip = () => screen.getByRole("region", { name: "KPI strip" })
const kpi = (name: string) => within(strip()).getByRole("article", { name })
const card = (name: RegExp) => within(screen.getByRole("region", { name: "Metric cards" })).getByRole("article", { name })
const ticker = () => screen.getByTestId("subscriber-ticker")
const headerTag = () => within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")
const spoken = () => ticker().querySelector("[role=status] .sr-only")?.textContent

/* ------------------------------------------------------------------ Home */

describe("Home with Stripe connected", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("connected")))

  it("Subscribers and Cash this week are Stripe's, with no Sample label", () => {
    renderHome()
    expect(within(kpi("Subscribers")).getByText("1,337")).toBeInTheDocument()
    expect(within(kpi("Subscribers")).getByText(/\+34 vs previous 28 days/)).toHaveAttribute("data-tone", "good")
    expect(within(kpi("Cash this week")).getByText("$4,322")).toBeInTheDocument()
    expect(within(kpi("Cash this week")).getByText(/\+10\.8% vs same time last week/)).toBeInTheDocument()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
      expect(kpi(name)).not.toHaveAttribute("aria-describedby")
      expect(kpi(name)).toHaveAttribute("data-source", "stripe")
    }
    // Nothing on the strip is invented any more, so it does not say so.
    expect(within(strip()).queryByTestId("kpi-sample-label")).toBeNull()
    expect(screen.queryByTestId("kpi-updated")).toBeNull()
  })

  it("the ticker shows the Subscribers total and today's net change, unlabelled", () => {
    renderHome()
    expect(spoken()).toBe("Subscribers: 1,337, up 3 today")
    expect(ticker()).toHaveAttribute("data-state", "ready")
    expect(within(ticker()).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("the Metrics door charts Stripe's MRR, unlabelled", () => {
    renderHome()
    const door = screen.getByRole("region", { name: "Metrics" })
    expect(within(door).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(door).getByText("From Stripe — the same MRR card as /metrics.")).toBeInTheDocument()
    expect(within(door).getByRole("img").getAttribute("aria-label")).toContain("$52k to $61.2k")
  })
})

describe("Home with Stripe stale", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("stale")))

  it("keeps the last figures and says when they are from, in the founder's zone", () => {
    renderHome()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(within(kpi(name)).getByTestId("kpi-updated")).toHaveTextContent("Last updated Tue, Oct 13 · 9:41 AM CDT")
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    expect(within(kpi("Subscribers")).getByText("1,337")).toBeInTheDocument()
    expect(ticker()).toHaveAttribute("data-state", "stale")
    expect(spoken()).toBe("Subscribers: 1,337, up 3 today, Last updated 9:41 AM CDT")
  })

  it("follows the Settings zone", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "America/Los_Angeles" }))
    renderHome()
    expect(within(kpi("Subscribers")).getByTestId("kpi-updated")).toHaveTextContent("Last updated Tue, Oct 13 · 7:41 AM PDT")
  })
})

describe("Home with Stripe not connected", () => {
  it("says Not connected with no figures and no sample labels (Home carries no sample data)", () => {
    renderHome()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(kpi(name)).toHaveAttribute("data-source", "not_connected")
      expect(within(kpi(name)).getByTestId("not-connected")).toBeInTheDocument()
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    expect(within(kpi("Subscribers")).queryByText("186")).toBeNull()
    expect(within(strip()).queryByTestId("kpi-sample-label")).toBeNull()
    expect(ticker()).toHaveAttribute("data-state", "not_connected")
    expect(within(ticker()).queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByText(/Last updated/)).toBeNull()
  })
})

describe("Home while the summary loads", () => {
  beforeEach(() => setStripeLoadingForTest())

  it("Stripe tiles are placeholders: no number, no label, busy", () => {
    renderHome()
    for (const name of ["Subscribers", "Cash this week"]) {
      expect(kpi(name)).toHaveAttribute("aria-busy", "true")
      expect(within(kpi(name)).getByTestId("kpi-placeholder")).toHaveTextContent("–Loading")
      expect(within(kpi(name)).queryByTestId("sample-data-tag")).toBeNull()
    }
    expect(ticker()).toHaveAttribute("data-state", "loading")
  })
})

/* --------------------------------------------------------------- Metrics */

describe("Metrics with Stripe connected", () => {
  beforeEach(() => setStripeSummaryForTest(liveSummary("connected")))

  it("MRR, Churn Rate, Trial Conversions and Subscribers are Stripe's, unlabelled", () => {
    renderMetrics()
    const expected: [RegExp, string][] = [
      [/^MRR\b/, "$61,235"],
      [/^Churn Rate\b/, "2.7%"],
      [/^Trial Conversions\b/, "41.2%"],
      [/^Subscribers\b/, "1,337"],
    ]
    for (const [name, value] of expected) {
      const c = card(name)
      expect(within(c).getByTestId("metric-value")).toHaveTextContent(value)
      expect(within(c).queryByTestId("sample-data-tag")).toBeNull()
      expect(c).toHaveAttribute("data-source", "stripe")
    }
    // Churn fell: good, as a lower-is-better metric.
    expect(within(card(/^Churn Rate\b/)).getByTestId("trend")).toHaveAttribute("data-good", "true")
  })

  it("every other card stays sample, labelled", () => {
    renderMetrics()
    for (const name of [/^ARR\b/, /^Revenue\b/, /^Retention\b/, /^Expenses\b/]) {
      expect(within(card(name)).getByTestId("sample-data-tag")).toBeInTheDocument()
      expect(card(name)).toHaveAttribute("data-source", "sample")
    }
  })

  it("a rate with no prior reading says so instead of inventing a trend; empty windows chart as gaps", () => {
    renderMetrics()
    const trials = card(/^Trial Conversions\b/)
    expect(within(trials).queryByTestId("trend")).toBeNull()
    expect(within(trials).getByText("No reading for the previous 28 days")).toBeInTheDocument()
    expect(within(trials).getByRole("img").getAttribute("aria-label")).toMatch(/no data, .*no data, .*30%/)
  })

  it("the page notice says Partly live and which cards are live", () => {
    renderMetrics()
    const notice = screen.getByRole("note", { name: "Partly live" })
    expect(notice).toHaveTextContent(
      /^Partly live\. MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe \(read-only\); Subscribers also counts App Store payers from Chlk’s database \(read-only\)\./
    )
    expect(notice).toHaveTextContent("PostHog is not connected yet, and Supabase only for that count")
    expect(notice).not.toHaveTextContent("Sample data")
  })

  it("the notice does not claim the App Store when it is not connected", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    renderMetrics()
    const notice = screen.getByRole("note", { name: "Partly live" })
    expect(notice).toHaveTextContent(/are live from Stripe \(read-only\)\. Every other number/)
    expect(notice).not.toHaveTextContent("App Store")
    expect(notice).toHaveTextContent("Supabase and PostHog are not connected yet")
  })

  it("drops the header Sample chip; the sample cards keep theirs", () => {
    renderMetrics()
    expect(headerTag()).toBeNull()
    expect(within(card(/^ARR\b/)).getByTestId("sample-data-tag")).toBeInTheDocument()
  })
})

describe("Metrics with nothing to divide by", () => {
  it("shows an em dash and why — never 0%", () => {
    setStripeSummaryForTest(
      liveSummary("connected", {
        ...LIVE_METRICS,
        trialToPaid: { value: null, previous: null, series: [null, null, null, null, null, null], converted: 0, ended: 0 },
      })
    )
    renderMetrics()
    const trials = card(/^Trial Conversions\b/)
    expect(within(trials).getByTestId("metric-value")).toHaveTextContent("—")
    expect(within(trials).getByText("No trials ended in the last 28 days")).toBeInTheDocument()
    expect(within(trials).queryByRole("img")).toBeNull()
  })
})

describe("Metrics with Stripe stale", () => {
  it("the live cards say when they were last updated", () => {
    setStripeSummaryForTest(liveSummary("stale"))
    renderMetrics()
    expect(within(card(/^MRR\b/)).getByTestId("metric-updated")).toHaveTextContent("Last updated Tue, Oct 13 · 9:41 AM CDT")
    expect(within(card(/^ARR\b/)).queryByTestId("metric-updated")).toBeNull()
    expect(screen.getByTestId("sample-data-notice")).toHaveTextContent("as of their last update")
    expect(screen.getByRole("note", { name: "Partly live" })).toBeInTheDocument()
    expect(headerTag()).toBeNull()
  })
})

describe("Metrics with Stripe not connected", () => {
  it("every card is sample, labelled, and the notice says nothing is connected", () => {
    renderMetrics()
    expect(within(card(/^MRR\b/)).getByTestId("metric-value")).toHaveTextContent("$26,190")
    expect(within(card(/^MRR\b/)).getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(screen.getByTestId("sample-data-notice")).toHaveTextContent("Nothing is connected to Stripe")
    expect(screen.getByRole("note", { name: "Sample data" })).toHaveTextContent(/^Sample data\./)
    expect(headerTag()).toHaveTextContent("Sample data")
  })
})

/* ------------------------------------------------- Subscribers breakdown */

const rowsOf = (el: HTMLElement) =>
  [...within(el).getByTestId("subscriber-breakdown").querySelectorAll("[data-row]")].map((r) => [
    r.querySelector("dt")!.textContent,
    r.querySelector("dd")!.textContent,
  ])

describe("Subscribers total and its breakdown", () => {
  it("App Store connected: Home's card shows 1,337 over its three groups, and no caveat", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    renderHome()
    const c = kpi("Subscribers")
    expect(within(c).getByText("1,337")).toBeInTheDocument()
    expect(rowsOf(c)).toEqual([
      ["Stripe paying", "1,110"],
      ["App Store", "53"],
      ["Free (never paid)", "174"],
    ])
    expect(within(c).getByTestId("subscriber-breakdown-note")).toBeEmptyDOMElement()
  })

  it("App Store not connected: the total leaves it out and says so — never a 0", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    renderHome()
    const c = kpi("Subscribers")
    expect(within(c).getByText("1,284")).toBeInTheDocument()
    expect(rowsOf(c)[1]).toEqual(["App Store", "Not connected"])
    expect(within(c).getByTestId("subscriber-breakdown-note")).toHaveTextContent("Total excludes App Store (not connected)")
    expect(spoken()).toBe("Subscribers: 1,284, up 3 today")
  })

  it("a stale App Store count stays in the total and says when it is from", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_STALE))
    renderHome()
    expect(within(kpi("Subscribers")).getByTestId("subscriber-breakdown-note")).toHaveTextContent(
      "App Store as of Tue, Oct 13 · 9:41 AM CDT"
    )
  })

  it("Metrics › Subscribers shows the same total and rows", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    renderMetrics()
    const c = card(/^Subscribers\b/)
    expect(within(c).getByTestId("metric-value")).toHaveTextContent("1,337")
    expect(rowsOf(c)).toEqual([
      ["Stripe paying", "1,110"],
      ["App Store", "53"],
      ["Free (never paid)", "174"],
    ])
    expect(within(c).getByTestId("trend")).toHaveTextContent("+34")
  })

  it("sample and loading cards keep the breakdown's room but show nothing in it", () => {
    renderHome()
    const reserve = within(kpi("Subscribers")).getByTestId("subscriber-breakdown-reserve")
    expect(reserve).toHaveAttribute("aria-hidden", "true")
    expect(reserve).toHaveClass("invisible")
    expect(within(kpi("Subscribers")).queryByTestId("subscriber-breakdown")).toBeNull()
    renderMetrics()
    expect(within(card(/^Subscribers\b/)).queryByTestId("subscriber-breakdown")).toBeNull()
  })
})

/* -------------------------------------------------------------- Settings */

describe("Settings › Connected data", () => {
  const row = (name: string) =>
    within(screen.getByRole("region", { name: "Connected data" })).getByRole("listitem", { name })

  it("connected: Stripe says Connected and when it last synced; the others are not connected", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    render(<SettingsScreen />)
    expect(within(row("Stripe")).getByTestId("stripe-status")).toHaveTextContent("Connected")
    expect(within(row("Stripe")).getByTestId("stripe-detail")).toHaveTextContent(
      "Read-only · last synced Tue, Oct 13 · 9:41 AM CDT"
    )
    for (const name of ["PostHog", "Sentry", "Gmail"]) expect(row(name)).toHaveTextContent("Not connected")
    expect(screen.getByRole("region", { name: "Sample data" })).toHaveTextContent("Stripe's figures are live")
  })

  it("stale: Last updated <time>, in the saved zone", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "UTC" }))
    setStripeSummaryForTest(liveSummary("stale"))
    render(<SettingsScreen />)
    expect(within(row("Stripe")).getByTestId("stripe-status")).toHaveTextContent("Last updated Tue, Oct 13 · 2:41 PM UTC")
    expect(within(row("Stripe")).getByTestId("stripe-detail")).toHaveTextContent("last good ones")
  })

  it("not connected: Not connected, like the rest", () => {
    render(<SettingsScreen />)
    expect(row("Stripe")).toHaveTextContent("Not connected")
    expect(within(row("Stripe")).queryByTestId("stripe-detail")).toBeNull()
    expect(screen.getByRole("region", { name: "Sample data" })).toHaveTextContent("Nothing is connected yet")
  })

  it("Gmail connected: Connected, the inbox and when it last synced; stale: Last updated", () => {
    setGmailSummaryForTest(liveGmailSummary(FIXED_NOW_MS))
    const { unmount } = render(<SettingsScreen />)
    expect(within(row("Gmail")).getByTestId("gmail-status")).toHaveTextContent("Connected")
    expect(within(row("Gmail")).getByTestId("gmail-detail")).toHaveTextContent(/^info@chlkapp\.com, read-only · last synced /)
    expect(row("Stripe")).toHaveTextContent("Not connected")
    expect(screen.getByRole("region", { name: "Sample data" })).toHaveTextContent("The CRM's Gmail conversations are live")
    unmount()
    setGmailSummaryForTest({ ...liveGmailSummary(FIXED_NOW_MS), status: "stale" })
    render(<SettingsScreen />)
    expect(within(row("Gmail")).getByTestId("gmail-status")).toHaveTextContent(/^Last updated /)
    expect(within(row("Gmail")).getByTestId("gmail-detail")).toHaveTextContent("last good threads")
  })

  it("loading: Checking…", () => {
    setStripeLoadingForTest()
    render(<SettingsScreen />)
    expect(row("Stripe")).toHaveTextContent("Checking…")
  })
})
