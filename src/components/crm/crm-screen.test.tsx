import * as React from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { PERSISTENCE_COPY } from "@/components/persistence-note"
import { CrmProvider } from "@/components/crm/crm-store"
import { CaseDetail } from "@/components/crm/case-detail"
import { CasesScreen } from "@/components/crm/cases-screen"
import { ContactsScreen } from "@/components/crm/contacts-screen"
import { CrmShell, LEDE } from "@/components/crm/crm-shell"
import { OverviewScreen } from "@/components/crm/overview-screen"
import { TriageScreen } from "@/components/crm/triage-screen"

const NOW = FIXED_NOW_MS

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm",
}))

function renderCrm(ui: React.ReactNode, nowMs = NOW) {
  return render(<CrmProvider nowMs={nowMs}>{ui}</CrmProvider>)
}

beforeEach(() => {
  navigation.params = new URLSearchParams()
  navigation.push.mockReset()
})

describe("CRM overview", () => {
  it("shows the seed counts, triage banner, and oldest untouched", () => {
    renderCrm(<OverviewScreen />)
    expect(screen.getByText(/6 contacts/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 New" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "3 Open" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 Waiting on customer" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 Urgent, not closed" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /2 conversations from unknown senders/ })).toBeInTheDocument()
    expect(screen.getByText("Staff seats invite fails on the iPad")).toBeInTheDocument()
    expect(screen.getByText("Apple Pencil skips strokes in the play editor")).toBeInTheDocument()
  })
})

describe("CRM shell", () => {
  it("renders the header, lede, shared note and chip, and section nav", () => {
    renderCrm(
      <CrmShell>
        <OverviewScreen />
      </CrmShell>
    )
    expect(screen.getByRole("heading", { level: 1, name: "CRM" })).toBeInTheDocument()
    expect(screen.getByText(LEDE)).toBeInTheDocument()
    expect(screen.getByTestId("persistence-note")).toHaveTextContent(PERSISTENCE_COPY.unsaved)
    const header = screen.getByRole("heading", { level: 1, name: "CRM" }).closest("header")!
    expect(within(header).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    expect(screen.getByRole("navigation", { name: "CRM sections" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Triage/ })).toHaveTextContent("2")
    expect(screen.getByRole("button", { name: /Search/ })).toBeEnabled()
  })
})

describe("Cases", () => {
  it("lists the eight seed cases with sample tags on seed rows", () => {
    renderCrm(<CasesScreen />)
    expect(screen.getByRole("heading", { level: 2, name: "Cases" })).toBeInTheDocument()
    const table = screen.getByRole("table", { name: "Cases" })
    expect(within(table).getAllByRole("row")).toHaveLength(9)
    expect(within(table).getAllByTestId("sample-data-tag")).toHaveLength(8)
    expect(within(table).getByText("Staff seats invite fails on the iPad")).toBeInTheDocument()
  })

  it("opens a case, changes status and priority, and adds a note", async () => {
    const user = userEvent.setup()
    renderCrm(<CaseDetail caseId="case-1" />)
    expect(screen.getByRole("heading", { level: 2, name: /Staff seats invite fails/ })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Case status" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Waiting on customer" }))
    expect(screen.getByText(/Status changed to Waiting on customer/)).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "Priority" }))
    await user.click(await screen.findByRole("option", { name: "Urgent" }))
    expect(screen.getByRole("combobox", { name: "Priority" })).toHaveTextContent("Urgent")
    await user.type(screen.getByLabelText("Internal note"), "Called Marcus back")
    await user.click(screen.getByRole("button", { name: "Add note" }))
    expect(screen.getByText("Called Marcus back")).toBeInTheDocument()
    expect(screen.getByText("Called Marcus back").closest("div")!.querySelector("[data-testid=sample-data-tag]")).toBeNull()
  })
})

describe("Contacts", () => {
  it("lists the six seed people and can add one without a sample tag", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    expect(screen.getByRole("table", { name: "Contacts" }).querySelectorAll("tbody tr")).toHaveLength(6)
    await user.click(screen.getByRole("button", { name: "New contact" }))
    const dialog = screen.getByRole("dialog", { name: "New contact" })
    await user.type(within(dialog).getByLabelText("Email"), "pat@katyisd.org")
    await user.type(within(dialog).getByLabelText("First name"), "Pat")
    await user.type(within(dialog).getByLabelText("Last name"), "Reyes")
    await user.click(within(dialog).getByRole("button", { name: "Create contact" }))
    expect(screen.getByRole("table", { name: "Contacts" }).querySelectorAll("tbody tr")).toHaveLength(7)
    const pat = screen.getByRole("row", { name: /Pat Reyes/ })
    expect(within(pat).queryByTestId("sample-data-tag")).toBeNull()
    expect(within(screen.getByRole("row", { name: /Marcus Hale/ })).getByTestId("sample-data-tag")).toBeInTheDocument()
  })

  it("keeps the dialog open with an inline error for a duplicate email", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    await user.click(screen.getByRole("button", { name: "New contact" }))
    const dialog = screen.getByRole("dialog", { name: "New contact" })
    const email = within(dialog).getByLabelText("Email")
    await user.type(email, "  MHALE@westfieldfb.org ")
    await user.click(within(dialog).getByRole("button", { name: "Create contact" }))
    expect(dialog).toBeVisible()
    expect(within(dialog).getByRole("alert")).toHaveTextContent("A contact with this email already exists.")
    expect(email).toHaveAttribute("aria-invalid", "true")
    expect(email).toHaveAttribute("aria-describedby", "new-email-error")
    expect(email).toHaveFocus()
    expect(screen.getByText(/6 people/)).toBeInTheDocument()
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
  it("shows the two unknown senders and promote removes the card", async () => {
    const user = userEvent.setup()
    renderCrm(<TriageScreen />)
    expect(screen.getByText("Riley Nash")).toBeInTheDocument()
    expect(screen.getByText("Alex Kim")).toBeInTheDocument()
    const riley = screen.getByText("Riley Nash").closest("[data-slot=triage-card]") as HTMLElement
    await user.click(within(riley).getByRole("button", { name: "Promote to case" }))
    expect(screen.queryByText("Riley Nash")).not.toBeInTheDocument()
    expect(screen.getByText("Alex Kim")).toBeInTheDocument()
  })
})
