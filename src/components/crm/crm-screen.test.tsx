import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { seedCases, seedContacts, seedMessages, seedNotes, seedOrganizations } from "@/lib/crm/fixture"
import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailSummaryForTest } from "@/test/gmail"
import { CLEAR_COPY, CLEAR_DESCRIPTION, PERSISTENCE_COPY } from "@/components/persistence-note"
import { CrmProvider, STORAGE_KEY, initialState, reducer, saveState, type State } from "@/components/crm/crm-store"
import { CaseDetail } from "@/components/crm/case-detail"
import { CasesScreen } from "@/components/crm/cases-screen"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import { CrmShell, LEDE } from "@/components/crm/crm-shell"
import { GMAIL_HINT, GMAIL_PANEL_TITLES } from "@/components/crm/gmail-not-connected"
import { OverviewScreen } from "@/components/crm/overview-screen"
import { TriageScreen } from "@/components/crm/triage-screen"

const NOW = FIXED_NOW_MS
const LIVE = liveGmailSummary(NOW)

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm",
}))

function renderCrm(ui: React.ReactNode, nowMs = NOW) {
  return render(<CrmProvider nowMs={nowMs}>{ui}</CrmProvider>)
}

/** A contact the founder added by hand while Gmail is not connected. */
function saveMine(): State {
  const mine = reducer(initialState(NOW), {
    type: "add-contact",
    input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes", organizationName: "Katy ISD" },
    at: new Date(NOW).toISOString(),
  })
  saveState(window.localStorage, mine)
  return mine
}

/** A copy saved before the sample was removed: every sample row is still in it. */
const oldSample = (): State => ({
  ...initialState(NOW),
  organizations: seedOrganizations(NOW),
  contacts: seedContacts(NOW),
  cases: seedCases(NOW),
  messages: seedMessages(NOW),
  notes: seedNotes(NOW),
})
const saveOldSample = (state = oldSample()) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

const panel = () => screen.getByTestId("crm-not-connected")
const SEED_SUBJECT = "Staff seats invite fails on the iPad"

beforeEach(() => {
  navigation.params = new URLSearchParams()
  navigation.push.mockReset()
})

describe("CRM overview", () => {
  it("Gmail not connected: the Not connected panel, no counts, no sample conversations", () => {
    saveOldSample()
    renderCrm(<OverviewScreen />)
    expect(panel()).toHaveTextContent(GMAIL_PANEL_TITLES.overview)
    expect(panel()).toHaveTextContent(GMAIL_HINT)
    expect(screen.queryByText(SEED_SUBJECT)).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /conversations from unknown senders/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/contacts you added/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })

  it("Gmail not connected with a contact the founder added: the panel plus a link to them", () => {
    saveMine()
    renderCrm(<OverviewScreen />)
    expect(panel()).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 contact you added" })).toHaveAttribute("href", "/crm/contacts")
  })

  it("live: the inbox's counts, triage banner and conversations", () => {
    setGmailSummaryForTest(LIVE)
    renderCrm(<OverviewScreen />)
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
    expect(screen.getByText(/3 contacts · 3 open conversations/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /2 conversations from unknown senders/ })).toBeInTheDocument()
    expect(screen.getAllByText("Roster import fails on a CSV with accents").length).toBeGreaterThan(0)
    expect(screen.queryByText(SEED_SUBJECT)).not.toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })
})

describe("CRM shell", () => {
  it("renders the header, lede, shared note, Clear my entries, source badge and section nav; no Sample tag", () => {
    renderCrm(
      <CrmShell>
        <OverviewScreen />
      </CrmShell>
    )
    const header = screen.getByRole("heading", { level: 1, name: "CRM" }).closest("header")!
    expect(within(header).getByText(LEDE)).toBeInTheDocument()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
    const clear = within(header).getByRole("button", { name: CLEAR_COPY.button })
    expect(clear).toHaveAttribute("aria-disabled", "true")
    expect(clear).toHaveAccessibleDescription(CLEAR_COPY.disabledHint)
    expect(within(header).queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
    expect(within(header).getByTestId("crm-source")).toHaveAttribute("data-source", "not_connected")
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "CRM sections" })).toBeInTheDocument()
    // Nothing pending in triage when nothing is synced.
    expect(screen.getByRole("link", { name: "Triage" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Search/ })).toBeEnabled()
  })

  it("Clear my entries asks first, then removes the founder's contacts and the saved key", async () => {
    const user = userEvent.setup()
    saveMine()
    renderCrm(
      <CrmShell>
        <ContactsScreen />
      </CrmShell>
    )
    expect(screen.getByRole("row", { name: /Pat Reyes/ })).toBeInTheDocument()
    const header = screen.getByRole("heading", { level: 1, name: "CRM" }).closest("header")!
    await user.click(within(header).getByRole("button", { name: CLEAR_COPY.button }))
    let dialog = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    expect(dialog).toHaveAccessibleDescription(CLEAR_DESCRIPTION)
    await user.click(within(dialog).getByRole("button", { name: "Keep my edits" }))
    expect(screen.getByRole("row", { name: /Pat Reyes/ })).toBeInTheDocument()

    await user.click(within(header).getByRole("button", { name: CLEAR_COPY.button }))
    dialog = await screen.findByRole("dialog", { name: CLEAR_COPY.title })
    await user.click(within(dialog).getByRole("button", { name: CLEAR_COPY.confirm }))
    expect(screen.queryByRole("row", { name: /Pat Reyes/ })).not.toBeInTheDocument()
    expect(screen.getByText("No contacts yet. Add someone by hand; they stay in this browser.")).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(within(header).getByRole("button", { name: CLEAR_COPY.button })).toHaveAttribute("aria-disabled", "true")
  })
})

describe("Cases", () => {
  it("Gmail not connected: the heading and the panel, no table, even with an old sample copy saved", () => {
    saveOldSample()
    renderCrm(<CasesScreen />)
    expect(screen.getByRole("heading", { level: 2, name: "Cases" })).toBeInTheDocument()
    expect(panel()).toHaveTextContent(GMAIL_PANEL_TITLES.cases)
    expect(screen.queryByRole("table", { name: "Cases" })).not.toBeInTheDocument()
    expect(screen.queryByText(SEED_SUBJECT)).not.toBeInTheDocument()
  })

  it("live: lists the inbox's cases with no sample tags", () => {
    setGmailSummaryForTest(LIVE)
    renderCrm(<CasesScreen />)
    const table = screen.getByRole("table", { name: "Cases" })
    expect(within(table).getAllByRole("row")).toHaveLength(LIVE.data.cases.length + 1)
    expect(within(table).getByText("Roster import fails on a CSV with accents")).toBeInTheDocument()
    expect(within(table).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(screen.queryByTestId("crm-not-connected")).not.toBeInTheDocument()
  })

  it("live: opens a case, changes status and priority, and adds a note", async () => {
    const user = userEvent.setup()
    setGmailSummaryForTest(LIVE)
    const roster = LIVE.data.cases.find((c) => c.subject === "Roster import fails on a CSV with accents")!
    renderCrm(<CaseDetail caseId={roster.id} />)
    expect(screen.getByRole("heading", { level: 2, name: /Roster import fails/ })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Case status" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Waiting on customer" }))
    expect(screen.getByText(/Status changed to Waiting on customer/)).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "Priority" }))
    await user.click(await screen.findByRole("option", { name: "Urgent" }))
    expect(screen.getByRole("combobox", { name: "Priority" })).toHaveTextContent("Urgent")
    await user.type(screen.getByLabelText("Internal note"), "Called Dana back")
    await user.click(screen.getByRole("button", { name: "Add note" }))
    expect(screen.getByText("Called Dana back")).toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })
})

describe("Contacts", () => {
  it("Gmail not connected: the panel above an empty list; a contact added by hand lists, untagged, and is saved", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    expect(panel()).toHaveTextContent(GMAIL_PANEL_TITLES.contacts)
    expect(screen.getByText(/0 people you added/)).toBeInTheDocument()
    expect(screen.getByText("No contacts yet. Add someone by hand; they stay in this browser.")).toBeInTheDocument()
    expect(screen.queryByRole("table", { name: "Contacts" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "New contact" }))
    const dialog = screen.getByRole("dialog", { name: "New contact" })
    await user.type(within(dialog).getByLabelText("Email"), "pat@example.org")
    await user.type(within(dialog).getByLabelText("First name"), "Pat")
    await user.type(within(dialog).getByLabelText("Last name"), "Reyes")
    await user.click(within(dialog).getByRole("button", { name: "Create contact" }))
    expect(screen.getByRole("table", { name: "Contacts" }).querySelectorAll("tbody tr")).toHaveLength(1)
    expect(screen.getByText(/1 person you added/)).toBeInTheDocument()
    expect(panel()).toBeInTheDocument()
    const pat = screen.getByRole("row", { name: /Pat Reyes/ })
    expect(within(pat).queryByTestId("sample-data-tag")).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("pat@example.org")
  })

  it("an old sample copy shows only the contact the founder added", () => {
    saveOldSample(
      reducer(oldSample(), {
        type: "add-contact",
        input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes" },
        at: new Date(NOW).toISOString(),
      })
    )
    renderCrm(<ContactsScreen />)
    const rows = screen.getByRole("table", { name: "Contacts" }).querySelectorAll("tbody tr")
    expect(rows).toHaveLength(1)
    expect(screen.getByRole("row", { name: /Pat Reyes/ })).toBeInTheDocument()
    expect(screen.queryByRole("row", { name: /Marcus Hale/ })).not.toBeInTheDocument()
  })

  it("keeps the dialog open with an inline error for a duplicate email", async () => {
    const user = userEvent.setup()
    saveMine()
    renderCrm(<ContactsScreen />)
    await user.click(screen.getByRole("button", { name: "New contact" }))
    const dialog = screen.getByRole("dialog", { name: "New contact" })
    const email = within(dialog).getByLabelText("Email")
    await user.type(email, "  PAT@example.org ")
    await user.click(within(dialog).getByRole("button", { name: "Create contact" }))
    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("alert")).toHaveTextContent("A contact with this email already exists.")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAttribute("aria-describedby", "new-email-error")
    expect(email).toHaveFocus()
    expect(screen.getByText(/1 person you added/)).toBeInTheDocument()
  })

  it("keeps the dialog open with an inline error for a malformed email", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    await user.click(screen.getByRole("button", { name: "New contact" }))
    const dialog = screen.getByRole("dialog", { name: "New contact" })
    const email = within(dialog).getByLabelText("Email")
    await user.type(email, "not-an-email")
    await user.click(within(dialog).getByRole("button", { name: "Create contact" }))
    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a valid email address.")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAttribute("aria-describedby", "new-email-error")
    expect(email).toHaveFocus()
  })
})

describe("Triage", () => {
  it("Gmail not connected: the panel and no sender cards, even with an old sample copy saved", () => {
    saveOldSample()
    renderCrm(<TriageScreen />)
    expect(panel()).toHaveTextContent(GMAIL_PANEL_TITLES.triage)
    expect(screen.queryByText("Riley Nash")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Promote to case" })).not.toBeInTheDocument()
  })

  it("live: shows the two unknown senders and promote removes the card", async () => {
    const user = userEvent.setup()
    setGmailSummaryForTest(LIVE)
    renderCrm(<TriageScreen />)
    expect(screen.getByText("Sam Patel")).toBeInTheDocument()
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument()
    const sam = screen.getByText("Sam Patel").closest("[data-slot=triage-card]") as HTMLElement
    await user.click(within(sam).getByRole("button", { name: "Promote to case" }))
    expect(screen.queryByText("Sam Patel")).not.toBeInTheDocument()
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument()
    expect(screen.queryByTestId("sample-data-tag")).not.toBeInTheDocument()
  })
})
