import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { navigation } from "@/test/setup"
import { LIVE_POSTHOG_METRICS, livePosthogSummary, setPosthogLoadingForTest, setPosthogSummaryForTest } from "@/test/posthog"
import { APP_STORE_OFF, LIVE_METRICS, liveSummary, setStripeSummaryForTest } from "@/test/stripe"
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/settings"
import { MetricsProvider } from "@/components/metrics/metrics-store"
import { MetricsTabs } from "@/components/metrics/metrics-tabs"
import { MetricsSampleNotice } from "@/components/metrics/metrics-sample-notice"
import { SettingsScreen } from "@/components/settings/settings-screen"

/**
 * Every PostHog-fed surface in its states: Retention and Active Users on
 * Metrics, the page notice beside Stripe's, and Settings › Connected data.
 * Not connected is the default for every test (src/test/setup.ts).
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

function renderMetrics() {
  navigation.params = new URLSearchParams()
  return render(
    <MetricsProvider nowMs={FIXED_NOW_MS}>
      {/* The header carries no Sample chip any more; the empty header keeps
          the "no chip" checks meaningful. */}
      <header data-testid="metrics-header" />
      <MetricsSampleNotice />
      <MetricsTabs />
    </MetricsProvider>
  )
}

const card = (name: RegExp) => screen.getByRole("article", { name })

async function addActiveUsers() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Add metric" }))
  await user.click(await screen.findByRole("button", { name: /^Active Users/ }))
}

describe("Metrics with PostHog connected", () => {
  beforeEach(() => setPosthogSummaryForTest(livePosthogSummary("connected")))

  it("Retention is PostHog's app retention, unlabelled, and says what it counts", () => {
    renderMetrics()
    const retention = card(/^Retention\b/)
    expect(retention).toHaveAttribute("data-source", "posthog")
    expect(within(retention).getByTestId("metric-value")).toHaveTextContent("58.4%")
    expect(within(retention).getByTestId("trend")).toHaveTextContent("+3.3 pts")
    expect(within(retention).getByTestId("metric-live-note")).toHaveTextContent("iOS app · 452 of 774 users came back")
    expect(within(retention).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(retention).queryByTestId("metric-updated")).toBeNull()
  })

  it("Active Users is offered live in the picker, and once added shows 28-day actives with 24 h and 7 days", async () => {
    renderMetrics()
    await addActiveUsers()
    const active = card(/^Active Users\b/)
    expect(active).toHaveAttribute("data-source", "posthog")
    expect(within(active).getByTestId("metric-value")).toHaveTextContent("812")
    expect(within(active).getByTestId("trend")).toHaveTextContent("+4.9%")
    expect(within(active).getByTestId("metric-live-note")).toHaveTextContent("iOS app · 214 in 24 h · 455 in 7 days")
    expect(within(active).queryByTestId("sample-data-tag")).toBeNull()
    // Windows before PostHog chart as gaps, not zeros.
    expect(within(active).getByRole("img").getAttribute("aria-label")).toMatch(/no data, .*no data, .*610/)
  })

  it("Stripe's cards say Not connected while Stripe is not connected, with no figure", () => {
    renderMetrics()
    for (const name of [/^MRR\b/, /^Churn Rate\b/, /^Subscribers\b/, /^ARR\b/]) {
      expect(card(name)).toHaveAttribute("data-source", "not_connected")
      expect(within(card(name)).queryByTestId("sample-data-tag")).toBeNull()
      expect(within(card(name)).getByTestId("metric-value")).toHaveTextContent("\u2014")
    }
  })

  it("the notice says Partly live, PostHog's cards only, and that Stripe is not connected", () => {
    renderMetrics()
    const notice = screen.getByRole("note", { name: "Partly live" })
    expect(notice).toHaveTextContent(
      /^Partly live\. Retention and Active Users are live from PostHog \(read-only, iOS app events only\)\. Every other card says Not connected until its source is wired up; none shows an invented figure/
    )
    expect(notice).not.toHaveTextContent(/illustrative|sample/i)
    expect(notice).not.toHaveTextContent("from Stripe")
    expect(within(screen.getByTestId("metrics-header")).queryByTestId("sample-data-tag")).toBeNull()
  })

  it("with Stripe live too, the notice names both sources' cards", () => {
    setStripeSummaryForTest(liveSummary("connected", LIVE_METRICS, APP_STORE_OFF))
    renderMetrics()
    const notice = screen.getByRole("note", { name: "Partly live" })
    expect(notice).toHaveTextContent(
      /^Partly live\. MRR, Churn Rate, Trial Conversions and Subscribers are live from Stripe \(read-only\); Retention and Active Users are live from PostHog \(read-only, iOS app events only\)\. Every other card says Not connected/
    )
    expect(card(/^MRR\b/)).toHaveAttribute("data-source", "stripe")
    expect(card(/^Retention\b/)).toHaveAttribute("data-source", "posthog")
  })

  it("with Stripe and the App Store live, the App Store count is named as live from Chlk's database", () => {
    setStripeSummaryForTest(liveSummary("connected"))
    renderMetrics()
    expect(screen.getByRole("note", { name: "Partly live" })).toHaveTextContent(
      "Subscribers also counts App Store payers from Chlk’s database (read-only)"
    )
  })
})

describe("Metrics with PostHog stale", () => {
  it("the live cards say when they were last updated, and the notice says so", () => {
    setPosthogSummaryForTest(livePosthogSummary("stale"))
    renderMetrics()
    expect(within(card(/^Retention\b/)).getByTestId("metric-updated")).toHaveTextContent(
      "Last updated Tue, Oct 13 · 9:41 AM CDT"
    )
    expect(screen.getByRole("note", { name: "Partly live" })).toHaveTextContent(
      "live from PostHog (read-only, iOS app events only), as of their last update"
    )
  })
})

describe("Metrics with too little PostHog history", () => {
  it("shows an em dash and why — never 0 or 0%", async () => {
    setPosthogSummaryForTest(
      livePosthogSummary("connected", {
        activeUsers: { value: null, previous: null, series: [null, null, null, null, null, null], day: 5, week: 9 },
        retention: { value: null, previous: null, series: [null, null, null, null, null, null], retained: null, base: null },
        since: "2026-10-01T00:00:00.000Z",
      })
    )
    renderMetrics()
    const retention = card(/^Retention\b/)
    expect(within(retention).getByTestId("metric-value")).toHaveTextContent("—")
    expect(within(retention).getByText("PostHog has under 56 days of app events")).toBeInTheDocument()
    await addActiveUsers()
    const active = card(/^Active Users\b/)
    expect(within(active).getByTestId("metric-value")).toHaveTextContent("—")
    expect(within(active).getByText("PostHog has under 28 days of app events")).toBeInTheDocument()
  })

  it("nobody active in the window before: retention has nothing to divide by", () => {
    setPosthogSummaryForTest(
      livePosthogSummary("connected", {
        ...LIVE_POSTHOG_METRICS,
        retention: { ...LIVE_POSTHOG_METRICS.retention, value: null, retained: 0, base: 0 },
      })
    )
    renderMetrics()
    expect(within(card(/^Retention\b/)).getByText("No app users in the 28 days before")).toBeInTheDocument()
  })
})

describe("Metrics with PostHog not connected or loading", () => {
  it("not connected: Retention and Active Users say Not connected, with no figure", async () => {
    renderMetrics()
    expect(card(/^Retention\b/)).toHaveAttribute("data-source", "not_connected")
    expect(within(card(/^Retention\b/)).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(card(/^Retention\b/)).queryByTestId("metric-live-note")).toBeNull()
    await addActiveUsers()
    expect(card(/^Active Users\b/)).toHaveAttribute("data-source", "not_connected")
    expect(within(card(/^Active Users\b/)).getByTestId("metric-value")).toHaveTextContent("\u2014")
    expect(within(card(/^Active Users\b/)).getByTestId("metric-value")).not.toHaveTextContent("731")
    expect(screen.getByRole("note", { name: "Not connected" })).toBeInTheDocument()
    expect(screen.queryByRole("note", { name: "Sample data" })).toBeNull()
  })

  it("loading: a placeholder, never a sample number that then swaps", () => {
    setPosthogLoadingForTest()
    renderMetrics()
    expect(card(/^Retention loading/)).toHaveAttribute("aria-busy", "true")
    expect(within(card(/^Retention loading/)).getByTestId("metric-value")).toHaveTextContent("–")
  })
})

describe("Settings › Connected data — PostHog", () => {
  const row = (name: string) =>
    within(screen.getByRole("region", { name: "Connected data" })).getByRole("listitem", { name })

  it("connected: Connected and when it last synced; Stripe still not connected", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    render(<SettingsScreen />)
    expect(within(row("PostHog")).getByTestId("posthog-status")).toHaveTextContent("Connected")
    expect(within(row("PostHog")).getByTestId("posthog-detail")).toHaveTextContent(
      "Read-only · last synced Tue, Oct 13 · 9:41 AM CDT"
    )
    expect(row("PostHog")).toHaveTextContent("Active users and retention (iOS app)")
    for (const name of ["Stripe", "Sentry", "Gmail"]) expect(row(name)).toHaveTextContent("Not connected")
    expect(screen.getByRole("region", { name: "Sample data" })).toHaveTextContent("PostHog's figures are live")
  })

  it("both live: the Sample data section names both", () => {
    setPosthogSummaryForTest(livePosthogSummary("connected"))
    setStripeSummaryForTest(liveSummary("connected"))
    render(<SettingsScreen />)
    expect(screen.getByRole("region", { name: "Sample data" })).toHaveTextContent("Stripe's and PostHog's figures are live")
  })

  it("stale: Last updated <time>, in the saved zone", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "UTC" }))
    setPosthogSummaryForTest(livePosthogSummary("stale"))
    render(<SettingsScreen />)
    expect(within(row("PostHog")).getByTestId("posthog-status")).toHaveTextContent("Last updated Tue, Oct 13 · 2:41 PM UTC")
    expect(within(row("PostHog")).getByTestId("posthog-detail")).toHaveTextContent(
      "PostHog could not be read just now, so its figures are the last good ones."
    )
  })

  it("not connected: Not connected", () => {
    render(<SettingsScreen />)
    expect(row("PostHog")).toHaveTextContent("Not connected")
    expect(within(row("PostHog")).queryByTestId("posthog-status")).toBeNull()
  })

  it("loading: Checking…", () => {
    setPosthogLoadingForTest()
    render(<SettingsScreen />)
    expect(row("PostHog")).toHaveTextContent("Checking…")
  })
})
