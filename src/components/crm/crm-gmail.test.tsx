import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GMAIL_NOT_CONNECTED, gmailConnecting } from "@/lib/crm/gmail-summary"
import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailLoadingForTest, setGmailSummaryForTest } from "@/test/gmail"
import { STORAGE_KEY, CrmProvider } from "@/components/crm/crm-store"
import { CONNECTING_LEDE, CrmShell, LEDE, liveLede } from "@/components/crm/crm-shell"
import {
  GMAIL_CONNECTING_LABEL,
  GMAIL_LIVE_LABEL,
  GMAIL_NOT_CONNECTED_LABEL,
  GMAIL_READ_ONLY_NOTE,
} from "@/components/crm/crm-source-badge"
import { CasesScreen } from "@/components/crm/cases-screen"
import { OverviewScreen } from "@/components/crm/overview-screen"
import { TriageScreen } from "@/components/crm/triage-screen"

const NOW = FIXED_NOW_MS

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm",
}))

function renderCrm(ui: React.ReactNode) {
  return render(
    <CrmProvider nowMs={NOW}>
      <CrmShell>{ui}</CrmShell>
    </CrmProvider>
  )
}

const header = () => screen.getByRole("heading", { level: 1, name: "CRM" }).closest("header")!

beforeEach(() => {
  navigation.params = new URLSearchParams()
})

describe("CRM with Gmail not connected", () => {
  it("shows the sample, labelled, with 'Gmail not connected' beside it", () => {
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    expect(within(header()).getByTestId("crm-source")).toHaveTextContent(GMAIL_NOT_CONNECTED_LABEL)
    expect(within(header()).getByTestId("crm-source")).toHaveAttribute("data-source", "sample")
    expect(within(header()).getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(screen.getByText(/6 contacts/)).toBeInTheDocument()
    // Seed rows keep their own tags.
    expect(screen.getAllByTestId("sample-data-tag").length).toBeGreaterThan(1)
  })
})

describe("CRM while Gmail is loading", () => {
  it("shows skeletons, never sample rows that then swap", () => {
    setGmailLoadingForTest()
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("status", { name: "Loading saved CRM" })).toBeInTheDocument()
    expect(screen.queryByText(/6 contacts/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("crm-source")).not.toBeInTheDocument()
  })
})

describe("CRM while Gmail is connecting (first sync on the server)", () => {
  it("says Connecting…, keeps the skeletons, and shows neither the sample nor its label", () => {
    setGmailSummaryForTest(gmailConnecting())
    renderCrm(<OverviewScreen />)
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_CONNECTING_LABEL)
    expect(source).toHaveAttribute("data-source", "connecting")
    expect(source).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status", { name: "Loading saved CRM" })).toBeInTheDocument()
    expect(screen.queryByText(/6 contacts/)).not.toBeInTheDocument()
    expect(within(header()).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })

  it("hides everything the sample brings: no triage count, no sample lede, no saved-edits note or Reset", () => {
    // The not-connected sample has pending triage, so the count would show there.
    setGmailSummaryForTest(GMAIL_NOT_CONNECTED)
    const { unmount } = renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: /^Triage\s*\d+$/ })).toBeInTheDocument()
    unmount()

    setGmailSummaryForTest(gmailConnecting())
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: "Triage" })).toBeInTheDocument()
    expect(screen.queryByText(LEDE)).not.toBeInTheDocument()
    expect(within(header()).getByText(CONNECTING_LEDE)).toBeInTheDocument()
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Reset/ })).not.toBeInTheDocument()
  })
})

describe("CRM live from Gmail", () => {
  const LIVE = liveGmailSummary(NOW)

  it("shows the inbox's rows, says where they come from, and drops every sample label", () => {
    setGmailSummaryForTest(LIVE)
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(liveLede("info@chlkapp.com"))).toBeInTheDocument()
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_LIVE_LABEL)
    expect(source).toHaveAttribute("data-source", "gmail")
    expect(screen.getByTestId("crm-read-only")).toHaveTextContent(GMAIL_READ_ONLY_NOTE)
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(screen.getByText(/3 contacts · 3 open conversations/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /2 conversations from unknown senders/ })).toBeInTheDocument()
  })

  it("lists the cases and triage threads from the inbox", () => {
    setGmailSummaryForTest(LIVE)
    const { unmount } = renderCrm(<CasesScreen />)
    const table = screen.getByRole("table", { name: "Cases" })
    expect(within(table).getByText("Roster import fails on a CSV with accents")).toBeInTheDocument()
    expect(within(table).getByText("Refund for a duplicate charge")).toBeInTheDocument()
    unmount()
    renderCrm(<TriageScreen />)
    expect(screen.getByText("Sam Patel")).toBeInTheDocument()
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument()
    expect(screen.queryByText("Vendor News")).not.toBeInTheDocument()
  })

  it("stale: the last threads, with when they were last updated", () => {
    setGmailSummaryForTest({ ...LIVE, status: "stale" })
    renderCrm(<OverviewScreen />)
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(/^Last updated /)
    expect(source).toHaveAttribute("data-stale")
    expect(screen.getByText(/3 contacts/)).toBeInTheDocument()
  })

  it("an edit applies to the inbox copy in memory and is never written over the sample's saved copy", async () => {
    window.localStorage.setItem(STORAGE_KEY, "untouched")
    setGmailSummaryForTest(LIVE)
    renderCrm(<TriageScreen />)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(2)
    await userEvent.click(screen.getAllByRole("button", { name: "Promote to case" })[0]!)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("untouched")
  })

  it("a newer sync replaces the copy, and the edits made on the old one", async () => {
    let answer!: (summary: typeof LIVE) => void
    configureGmailSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<TriageScreen />)
    await userEvent.click(screen.getAllByRole("button", { name: "Promote to case" })[0]!)
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(1)

    const newer = { ...LIVE, lastSyncedAt: new Date(NOW).toISOString() }
    await act(async () => answer(newer))
    expect(screen.getAllByRole("button", { name: "Promote to case" })).toHaveLength(2)
  })

  it("Gmail disconnected later: back to the labelled sample", async () => {
    let answer!: (summary: typeof GMAIL_NOT_CONNECTED) => void
    configureGmailSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(/3 contacts/)).toBeInTheDocument()
    await act(async () => answer(GMAIL_NOT_CONNECTED))
    expect(screen.getByText(/6 contacts/)).toBeInTheDocument()
    expect(within(header()).getByTestId("crm-source")).toHaveAttribute("data-source", "sample")
  })
})
