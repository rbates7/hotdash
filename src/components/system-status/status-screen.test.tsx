import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { formatCheckedAgo } from "@/lib/system-status"
import { buildServices, type Scenario } from "@/lib/system-status-fixture"
import { StatusScreen } from "@/components/system-status/status-screen"
import { FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"

// 27 Aug 2026, 09:00 Chicago. Checks are seeded 2–6 minutes before it.
// The rows are test fixtures passed in as if a source had answered.
const mount = (scenario?: Scenario, nowMs = FIXED_NOW_MS) =>
  render(<StatusScreen nowMs={nowMs} services={scenario ? buildServices(nowMs, scenario) : undefined} />)

const banner = () => screen.getByRole("region", { name: "Current status" })
/** The verbose relative wording, through the page's own helper (explicit style). */
const ago = (nowMs: number, minutes: number) => formatCheckedAgo(nowMs - minutes * 60_000, nowMs)
const components = () => screen.getByRole("region", { name: "Components" })
const row = (name: string) => within(components()).getByRole("listitem", { name })

describe("StatusScreen", () => {
  it("green: one verdict, every row operational, each with icon + word + reason + Central check time", () => {
    mount("green")
    expect(screen.getByRole("heading", { level: 1, name: "System Status" })).toBeInTheDocument()
    expect(within(banner()).getByRole("heading", { level: 2, name: "All systems green" })).toBeInTheDocument()
    expect(banner()).toHaveAttribute("data-verdict", "green")
    expect(banner()).toHaveTextContent("Every check passed. Nothing needs you.")
    expect(banner()).toHaveTextContent(`Updated ${ago(FIXED_NOW_MS, 2)}`)
    expect(banner()).toHaveTextContent("7 operational")
    expect(components()).toHaveTextContent("None down")

    const rows = within(components()).getAllByRole("listitem")
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "iPad app API",
      "Sync",
      "Auth",
      "Billing",
      "chlkapp.com",
      "Export",
      "Sentry errors (24h)",
    ])
    for (const r of rows) {
      const label = within(r).getByTestId("status-label")
      expect(label).toHaveAttribute("data-status", "operational")
      expect(label).toHaveTextContent("Operational")
      expect(label.querySelector("svg[data-status-icon]")).not.toBeNull()
    }
    // The site row: reason, and the check time where the founder is.
    expect(row("chlkapp.com")).toHaveTextContent("Site up · 200 from Dallas")
    expect(row("chlkapp.com")).toHaveTextContent(`Checked ${ago(FIXED_NOW_MS, 2)} · 8:58 AM CT`)
    expect(row("Export")).toHaveTextContent(`Checked ${ago(FIXED_NOW_MS, 6)} · 8:54 AM CT`)
  })

  it("not green: the degraded row is named in the verdict and carries its own icon and word", () => {
    mount("not-green")
    expect(within(banner()).getByRole("heading", { level: 2, name: "Not green" })).toBeInTheDocument()
    expect(banner()).toHaveAttribute("data-verdict", "not-green")
    expect(banner()).toHaveTextContent("Billing is degraded · Stripe webhook delay. Other systems operational.")
    expect(banner()).toHaveTextContent("6 operational · 1 degraded")
    expect(components()).toHaveTextContent("None down")

    const billing = within(row("Billing")).getByTestId("status-label")
    expect(billing).toHaveAttribute("data-status", "degraded")
    expect(billing).toHaveTextContent("Degraded")
    expect(billing.querySelector("svg[data-status-icon]")).not.toBeNull()
    expect(row("Billing")).toHaveTextContent("Stripe webhook delay")
    // Everyone else is still green.
    expect(within(components()).getAllByText("Operational")).toHaveLength(6)
  })

  it("defaults to the real page: no checks, Not connected, no sample tag, notice or incident", () => {
    mount()
    expect(within(banner()).getByRole("heading", { level: 2, name: "No checks yet" })).toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByTestId("sample-data-notice")).toBeNull()
    expect(screen.queryByRole("note")).toBeNull()
    expect(screen.queryByRole("region", { name: "Past incident" })).toBeNull()
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0)
    expect(screen.queryByRole("group", { name: "Preview" })).toBeNull()
    expect(document.querySelector('a[href*="preview="]')).toBeNull()
    // None of the fixture's rows or reasons.
    for (const text of ["iPad app API", "Stripe webhook", "Site up", "3 errors", "Resolved"]) {
      expect(document.body).not.toHaveTextContent(text)
    }
  })

  it("rows from a source wear no sample tag, and link out to Sentry and the site as plain external links", () => {
    mount("green")
    expect(screen.queryByTestId("sample-data-tag")).toBeNull()
    expect(screen.queryByRole("note")).toBeNull()
    expect(screen.queryByText("Not connected")).toBeNull()
    const sentry = screen.getAllByRole("link", { name: "Sentry" })
    expect(sentry.length).toBeGreaterThan(0)
    for (const a of sentry) {
      expect(a).toHaveAttribute("href", "https://chlk.sentry.io")
      expect(a).toHaveAttribute("target", "_blank")
      expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"))
    }
    expect(within(row("chlkapp.com")).getByRole("link", { name: "chlkapp.com" })).toHaveAttribute("href", "https://chlkapp.com")
    // No bug list, and no invented incident history.
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByRole("region", { name: "Past incident" })).toBeNull()
  })

  it("every relative figure comes from nowMs, not the machine clock", () => {
    const anHourLater = FIXED_NOW_MS + 60 * 60_000
    mount("green", anHourLater)
    expect(banner()).toHaveTextContent(`Updated ${ago(anHourLater, 2)}`)
    expect(row("chlkapp.com")).toHaveTextContent(`Checked ${ago(anHourLater, 2)} · 9:58 AM CT`)
  })

  it("empty: a neutral 'No checks yet' headline, not green, and the list is empty", () => {
    mount("empty")
    expect(within(banner()).getByRole("heading", { level: 2, name: "No checks yet" })).toBeInTheDocument()
    expect(banner()).toHaveAttribute("data-verdict", "empty")
    expect(banner()).toHaveTextContent("Nothing is connected. There are no checks to report.")
    expect(banner()).not.toHaveTextContent("All systems green")
    expect(within(components()).queryAllByRole("listitem")).toHaveLength(0)
    expect(components()).toHaveTextContent("Nothing is connected. There are no checks to report.")
    expect(components()).toHaveTextContent("No checks")
  })

  it("late evening Central renders the same in either process zone", () => {
    // 23:30 CDT on 7 Oct = 04:30 UTC on 8 Oct — the shared instant.
    mount("not-green", LATE_EVENING_CT_MS)
    expect(row("Billing")).toHaveTextContent(`Checked ${ago(LATE_EVENING_CT_MS, 4)} · 11:26 PM CT`)
  })
})
