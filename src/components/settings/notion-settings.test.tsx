import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SettingsScreen } from "@/components/settings/settings-screen"
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/settings"
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

  it("loading: Checking…", () => {
    setNotionLoadingForTest()
    render(<SettingsScreen />)
    expect(row("Notion")).toHaveTextContent("Checking…")
  })
})
