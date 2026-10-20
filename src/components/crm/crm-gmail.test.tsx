import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GMAIL_NOT_CONNECTED, gmailConnecting } from "@/lib/crm/gmail-summary"
import { configureGmailSummary } from "@/hooks/use-gmail-summary"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailLoadingForTest, setGmailSummaryForTest } from "@/test/gmail"
import { CLEAR_COPY } from "@/components/persistence-note"
import { STORAGE_KEY, CrmProvider, initialState, reducer, saveState } from "@/components/crm/crm-store"
import { CONNECTING_LEDE, CrmShell, LEDE, liveLede } from "@/components/crm/crm-shell"
import { GMAIL_HINT, GMAIL_PANEL_TITLES } from "@/components/crm/gmail-not-connected"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import { ContactNewDialog, NEW_CONTACT_LIVE, NEW_CONTACT_PENDING } from "@/components/crm/contact-dialogs"
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
  it("says 'Gmail not connected' and shows the Not connected panel, never sample rows", () => {
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_NOT_CONNECTED_LABEL)
    expect(source).toHaveAttribute("data-source", "not_connected")
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(GMAIL_PANEL_TITLES.overview)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(screen.queryByText(/\d+ contacts ·/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: CLEAR_COPY.button })).toBeInTheDocument()
  })

  it.each([
    ["Cases", <CasesScreen key="cases" />, GMAIL_PANEL_TITLES.cases],
    ["Contacts", <ContactsScreen key="contacts" />, GMAIL_PANEL_TITLES.contacts],
    ["Triage", <TriageScreen key="triage" />, GMAIL_PANEL_TITLES.triage],
  ])("%s shows its own panel title", (_name, ui, title) => {
    renderCrm(ui)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(title)
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(GMAIL_HINT)
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
  it("says Connecting…, keeps the skeletons, and shows no panel, rows or Sample tag", () => {
    setGmailSummaryForTest(gmailConnecting())
    renderCrm(<OverviewScreen />)
    const source = within(header()).getByTestId("crm-source")
    expect(source).toHaveTextContent(GMAIL_CONNECTING_LABEL)
    expect(source).toHaveAttribute("data-source", "connecting")
    expect(source).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status", { name: "Loading saved CRM" })).toBeInTheDocument()
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ contacts/)).not.toBeInTheDocument()
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
    for (const ui of [<CasesScreen key="c" />, <ContactsScreen key="p" />, <TriageScreen key="t" />]) {
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
    renderCrm(<OverviewScreen />)
    expect(screen.getByRole("link", { name: "Triage" })).toBeInTheDocument()
    expect(screen.queryByText(LEDE)).not.toBeInTheDocument()
    expect(within(header()).getByText(CONNECTING_LEDE)).toBeInTheDocument()
    expect(screen.queryByTestId("persistence-note")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: CLEAR_COPY.button })).not.toBeInTheDocument()
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

  it("an edit applies to the inbox copy in memory and is never written over the founder's saved copy", async () => {
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

  it("Gmail disconnected later: the inbox's rows go, the panel shows, and no sample takes their place", async () => {
    let answer!: (summary: typeof GMAIL_NOT_CONNECTED) => void
    configureGmailSummary({
      initial: { phase: "ready", summary: LIVE },
      fetcher: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(/3 contacts/)).toBeInTheDocument()
    await act(async () => answer(GMAIL_NOT_CONNECTED))
    expect(screen.queryByText(/3 contacts/)).not.toBeInTheDocument()
    expect(screen.getByTestId("crm-not-connected")).toHaveTextContent(GMAIL_PANEL_TITLES.overview)
    expect(screen.queryAllByTestId("sample-data-tag")).toHaveLength(0)
    expect(within(header()).getByTestId("crm-source")).toHaveAttribute("data-source", "not_connected")
  })
})

describe("New contact dialog names Gmail as pending only while it is not live (item 10)", () => {
  async function openDialog() {
    const user = userEvent.setup()
    render(
      <CrmProvider nowMs={NOW}>
        <ContactNewDialog />
      </CrmProvider>
    )
    await user.click(screen.getByRole("button", { name: "New contact" }))
    return screen.findByRole("dialog", { name: "New contact" })
  }

  it("Gmail live: no 'once Gmail is connected'", async () => {
    setGmailSummaryForTest(liveGmailSummary(NOW))
    const dialog = await openDialog()
    expect(dialog).toHaveAccessibleDescription(NEW_CONTACT_LIVE)
    expect(dialog).not.toHaveTextContent(/once Gmail is connected/)
  })

  it("Gmail not connected: says Gmail is still to come", async () => {
    const dialog = await openDialog()
    expect(dialog).toHaveAccessibleDescription(NEW_CONTACT_PENDING)
  })
})
