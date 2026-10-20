import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { toCrmSummary } from "@/lib/crm/adapter"
import { GMAIL_NOT_CONNECTED, gmailConnecting } from "@/lib/crm/gmail-summary"
import { CRM_CONNECTING, CRM_NOT_CONNECTED, type CrmFetchResult, type CrmSummary } from "@/lib/crm/types.ours"
import { configureCrmSummary } from "@/hooks/use-crm-summary"
import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { setCrmLoadingForTest, setCrmSummaryForTest, setCrmUnauthorizedForTest } from "@/test/crm"
import { liveGmailSummary, setGmailLoadingForTest, setGmailSummaryForTest } from "@/test/gmail"
import { CLEAR_COPY } from "@/components/persistence-note"
import { STORAGE_KEY, CrmProvider, initialState, reducer, saveState } from "@/components/crm/crm-store"
import { CONNECTING_LEDE, CrmShell, LEDE, liveLede } from "@/components/crm/crm-shell"
import { GMAIL_HINT, GMAIL_PANEL_TITLES } from "@/components/crm/gmail-not-connected"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import {
  GMAIL_CONNECTING_LABEL,
  GMAIL_LIVE_LABEL,
  GMAIL_NOT_CONNECTED_LABEL,
} from "@/components/crm/crm-source-badge"
import { OverviewScreen } from "@/components/crm/overview-screen"
import { TriageScreen } from "@/components/crm/triage-screen"

/*
 * The CRM shell and screens across Gmail's states. The shell header and
 * Contacts / Triage read develop's store (`useGmailFeed`); the rebuilt
 * Overview reads `useCrmSummary`. Both read /api/crm/gmail, so each test
 * puts both in the same state.
 */

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
const counts = () => screen.getAllByTestId("crm-count")

beforeEach(() => {
  navigation.params = new URLSearchParams()
})

describe("CRM with Gmail not connected", () => {
  it("says 'Gmail not connected'; every tile is Not connected and no count reads 0", () => {
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_NOT_CONNECTED_LABEL)
    expect(source).toHaveAttribute("data-source", "not_connected")
    expect(counts()).toHaveLength(4)
    for (const count of counts()) {
      expect(within(count).getByTestId("not-connected")).toHaveTextContent("Not connected")
      expect(count).not.toHaveTextContent(/\d/)
    }
    const panels = screen.getAllByTestId("crm-not-connected")
    expect(panels).toHaveLength(2)
    for (const panel of panels) expect(panel).toHaveTextContent(GMAIL_HINT)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(screen.getByRole("button", { name: CLEAR_COPY.button })).toBeInTheDocument()
  })

  it.each([
    ["Contacts", <ContactsScreen key="contacts" />, GMAIL_PANEL_TITLES.contacts],
    ["Triage", <TriageScreen key="triage" />, GMAIL_PANEL_TITLES.triage],
  ])("%s shows its own panel title", (_name, ui, title) => {
    renderCrm(ui)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(title)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(GMAIL_HINT)
  })
})

describe("CRM while Gmail is loading", () => {
  it("shows skeletons and Connecting…, never rows that then swap", () => {
    setGmailLoadingForTest()
    setCrmLoadingForTest()
    renderCrm(<OverviewScreen />)
    for (const badge of screen.getAllByTestId("crm-connecting")) expect(badge).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByTestId("crm-source")).not.toBeInTheDocument()
    expect(screen.getByTestId("crm-live-region")).toHaveAttribute("role", "status")
    expect(screen.getByTestId("crm-live-region")).toHaveTextContent("Connecting")
  })
})

describe("CRM while Gmail is connecting (first sync on the server)", () => {
  it("says Connecting…, keeps the skeletons, and shows no panel, rows or Sample tag", () => {
    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    renderCrm(<OverviewScreen />)
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_CONNECTING_LABEL)
    expect(source).toHaveAttribute("data-source", "connecting")
    expect(source).toHaveAttribute("aria-busy", "true")
    expect(screen.getAllByTestId("crm-connecting").length).toBeGreaterThanOrEqual(6)
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
  })

  it("Connecting… on every screen: skeletons, never the Not connected panel, even with the founder's contacts saved", () => {
    saveState(
      window.localStorage,
      reducer(initialState(NOW), {
        type: "add-contact",
        input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes" },
        at: new Date(NOW).toISOString(),
      })
    )
    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    for (const ui of [<OverviewScreen key="o" />, <ContactsScreen key="p" />, <TriageScreen key="t" />]) {
      const { unmount } = renderCrm(ui)
      expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
      expect(screen.queryByText("Pat Reyes")).not.toBeInTheDocument()
      expect(within(header()).getByTestId("crm-source")).toHaveAttribute("data-source", "connecting")
      unmount()
    }
  })

  it("hides the saved-edits note, Clear my entries, the not-connected lede and any triage count", () => {
    setGmailSummaryForTest(GMAIL_NOT_CONNECTED)
    const { unmount } = renderCrm(<OverviewScreen />)
    expect(screen.getByTestId("persistence-note")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: CLEAR_COPY.button })).toBeInTheDocument()
    unmount()

    setGmailSummaryForTest(gmailConnecting())
    setCrmSummaryForTest(CRM_CONNECTING)
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: "Triage" })).toBeInTheDocument()
    expect(screen.queryByText(LEDE)).not.toBeInTheDocument()
    expect(within(header()).getByText(CONNECTING_LEDE)).toBeInTheDocument()
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: CLEAR_COPY.button })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Reset/ })).not.toBeInTheDocument()
  })
})

describe("CRM with the login session expired (401)", () => {
  it("says the session expired, not Not connected, in the header and every tile", () => {
    setCrmUnauthorizedForTest()
    renderCrm(<OverviewScreen />)
    expect(within(header()).getByTestId("crm-source")).toHaveAttribute("data-source", "unauthorized")
    expect(within(header()).getByTestId("crm-source")).toHaveTextContent("Session expired")
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByTestId("not-connected")).not.toBeInTheDocument()
    expect(screen.getAllByTestId("crm-session-expired")).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: "Log in again" })[0]).toHaveAttribute("href", "/unlock?next=%2Fcrm")
    expect(screen.getByRole("status")).toHaveTextContent("Your session expired.")
  })
})

describe("CRM live from Gmail", () => {
  const LIVE = liveGmailSummary(NOW)
  const CRM = toCrmSummary(LIVE, NOW)
  const live = () => {
    setGmailSummaryForTest(LIVE)
    setCrmSummaryForTest(CRM)
  }

  it("shows the inbox's counts, says where they come from, and drops every sample label", () => {
    live()
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(liveLede("info@chlkapp.com"))).toBeInTheDocument()
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_LIVE_LABEL)
    expect(source).toHaveAttribute("data-source", "gmail")
    // Overview, Cases and Accounts say "Edits save in this browser" themselves.
    expect(screen.queryByTestId("crm-read-only")).not.toBeInTheDocument()
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(screen.getByRole("link", { name: `${CRM.counts!.open} Open` })).toHaveAttribute("href", "/crm/cases")
    expect(screen.getByRole("link", { name: /2 conversations from unknown senders/ })).toBeInTheDocument()
  })

  it("lists the triage threads from the inbox", () => {
    live()
    renderCrm(<TriageScreen />)
    expect(screen.getByText("Sam Patel")).toBeInTheDocument()
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument()
    expect(screen.queryByText("Vendor News")).not.toBeInTheDocument()
  })

  it("stale: the last threads, with when they were last updated", () => {
    setGmailSummaryForTest({ ...LIVE, status: "stale" })
    setCrmSummaryForTest({ ...CRM, status: "stale" })
    renderCrm(<OverviewScreen />)
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(/^Last updated /)
    expect(source).toHaveAttribute("data-stale")
    expect(screen.getByTestId("crm-stale")).toHaveTextContent(/^Last updated /)
    expect(screen.getByRole("link", { name: `${CRM.counts!.open} Open` })).toBeInTheDocument()
  })

  it("an edit applies to the inbox copy in memory and is never written over the founder's saved copy", async () => {
    window.localStorage.setItem(STORAGE_KEY, "untouched")
    live()
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

  it("Gmail disconnected later: the counts go, the panels show, and no sample takes their place", async () => {
    let answer!: (r: CrmFetchResult<CrmSummary>) => void
    configureCrmSummary({
      initial: { phase: "ready", summary: CRM },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: `${CRM.counts!.open} Open` })).toBeInTheDocument()
    await act(async () => answer({ kind: "ok", data: CRM_NOT_CONNECTED }))
    expect(screen.queryByRole("link", { name: /Open$/ })).not.toBeInTheDocument()
    expect(screen.getAllByTestId("crm-not-connected")).toHaveLength(2)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
  })
})
