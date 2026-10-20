import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SettingsScreen } from "@/components/settings/settings-screen"
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/settings"
import { NOTION_CONNECTING } from "@/lib/notion-roadmap"
import { gmailConnecting } from "@/lib/crm/gmail-summary"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailSummaryForTest } from "@/test/gmail"
import { liveRoadmapSummary, setNotionLoadingForTest, setNotionRoadmapForTest } from "@/test/notion"

const row = (name: string) =>
  within(screen.getByRole("region", { name: "Connected data" })).getByRole("listitem", { name })

describe("Settings › Connected data › Notion", () => {
  it("not connected: Not connected, like the rest; feeds the Product Roadmap", () => {
    render(<SettingsScreen />)
    expect(row("Notion")).toHaveTextContent("Product Roadmap")
    expect(row("Notion")).toHaveTextContent("Not connected")
    expect(within(row("Notion")).queryByTestId("notion-detail")).toBeNull()
  })

  it("connected: Connected and when it last synced", () => {
    setNotionRoadmapForTest(liveRoadmapSummary("connected"))
    render(<SettingsScreen />)
    expect(within(row("Notion")).getByTestId("notion-status")).toHaveTextContent("Connected")
    expect(within(row("Notion")).getByTestId("notion-detail")).toHaveTextContent(
      "Read-only · last synced Wed, Oct 14 · 9:41 AM CDT"
    )
    for (const name of ["PostHog", "Sentry", "Gmail"]) expect(row(name)).toHaveTextContent("Not connected")
  })

  it("stale: Last updated <time>, in the saved zone", () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, timeZone: "UTC" }))
    setNotionRoadmapForTest(liveRoadmapSummary("stale"))
    render(<SettingsScreen />)
    expect(within(row("Notion")).getByTestId("notion-status")).toHaveTextContent("Last updated Wed, Oct 14 · 2:41 PM UTC")
    expect(within(row("Notion")).getByTestId("notion-detail")).toHaveTextContent("last good copy")
  })

  it("connecting: Connecting…, the shared row (test ids kept), and the Sample data line says so", () => {
    setNotionRoadmapForTest(NOTION_CONNECTING)
    render(<SettingsScreen />)
    expect(within(row("Notion")).getByTestId("notion-status")).toHaveTextContent("Connecting…")
    expect(within(row("Notion")).getByTestId("notion-detail")).toHaveTextContent(
      "Read-only token found · first sync in progress, the Roadmap appears when it finishes"
    )
    const sample = screen.getByRole("region", { name: "Sample data" })
    expect(sample).toHaveTextContent(
      "Notion is connecting (first sync in progress); the Product Roadmap shows a placeholder until then. Home, Metrics, Bugs, CRM and My Desk show nothing invented"
    )
    expect(sample).not.toHaveTextContent(/every number on every screen/i)
  })

  it("the copy names Notion: wired up so far, the Roadmap's sentence, and no 'Product Roadmap has no label' claim", () => {
    setNotionRoadmapForTest(liveRoadmapSummary("connected"))
    render(<SettingsScreen />)
    expect(screen.getByRole("region", { name: "Connected data" })).toHaveTextContent(
      "Stripe, PostHog, Gmail and Notion are wired up so far."
    )
    const sample = screen.getByRole("region", { name: "Sample data" })
    expect(sample).toHaveTextContent("The Product Roadmap is read from Notion")
    expect(sample).toHaveTextContent("carries the amber Sample data label, always: there is no switch to hide it")
    expect(within(sample).queryByRole("switch")).toBeNull()
  })

  it("loading: Checking…", () => {
    setNotionLoadingForTest()
    render(<SettingsScreen />)
    expect(row("Notion")).toHaveTextContent("Checking…")
  })
})

/* Gmail (#46) is a LIVE_FEEDS row like Notion: one status and one detail line. */
describe("Settings › Connected data › Gmail, through the shared row", () => {
  it("not connected: Not connected, no detail line", () => {
    render(<SettingsScreen />)
    expect(row("Gmail")).toHaveTextContent("Not connected")
    expect(within(row("Gmail")).queryByTestId("gmail-detail")).toBeNull()
  })

  it("connecting: Connecting… and the first-sync line", () => {
    setGmailSummaryForTest(gmailConnecting())
    render(<SettingsScreen />)
    expect(within(row("Gmail")).getByTestId("gmail-status")).toHaveTextContent("Connecting…")
    expect(within(row("Gmail")).getByTestId("gmail-detail")).toHaveTextContent(
      "Read-only access found · first sync in progress, the CRM's conversations appear when it finishes"
    )
  })

  it("connected names the mailbox; stale says the last good threads", () => {
    setGmailSummaryForTest(liveGmailSummary(FIXED_NOW_MS))
    const { unmount } = render(<SettingsScreen />)
    expect(within(row("Gmail")).getByTestId("gmail-status")).toHaveTextContent("Connected")
    expect(within(row("Gmail")).getByTestId("gmail-detail")).toHaveTextContent(/^info@chlkapp\.com, read-only · last synced /)
    unmount()
    setGmailSummaryForTest({ ...liveGmailSummary(FIXED_NOW_MS), status: "stale" })
    render(<SettingsScreen />)
    expect(within(row("Gmail")).getByTestId("gmail-status")).toHaveTextContent(/^Last updated /)
    expect(within(row("Gmail")).getByTestId("gmail-detail")).toHaveTextContent(
      "Gmail could not be read just now, so the CRM shows the last good threads."
    )
  })

  it("Gmail live and Notion connecting: the Sample data line names both, never 'every number on every screen'", () => {
    setGmailSummaryForTest(liveGmailSummary(FIXED_NOW_MS))
    setNotionRoadmapForTest(NOTION_CONNECTING)
    render(<SettingsScreen />)
    const sample = screen.getByRole("region", { name: "Sample data" })
    expect(sample).toHaveTextContent("The CRM's Gmail conversations are live and carry no label")
    expect(sample).toHaveTextContent("Notion is connecting (first sync in progress)")
    expect(sample).not.toHaveTextContent(/every number on (every|the other) screens? is still sample/i)
  })
})
