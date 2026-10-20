import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailSummaryForTest } from "@/test/gmail"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { ContactDetail } from "@/components/crm/contact-detail"
import { ContactsScreen, contactCardMeta } from "@/components/crm/contacts-screen"
import { CrmErrorAlert } from "@/components/crm/crm-error-alert"
import { CrmShell } from "@/components/crm/crm-shell"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"
import { CrmProvider, initialState, reducer, saveState, type State } from "@/components/crm/crm-store"
import { CRM_MENU_LABEL } from "@/components/crm/crm-header-menu"
import { CRM_DANGER_TEXT, CRM_DIALOG, CRM_ICON_44, CRM_ROW_44 } from "@/components/crm/crm-touch"
import { TriageScreen } from "@/components/crm/triage-screen"

/*
 * Contacts, triage, the shell and the error state below 1280. The rebuilt
 * Cases screen (cards, table, filters, panel) has its own suite:
 * cases-screen.test.tsx.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm/contacts",
}))

beforeAll(() => {
  // Base UI menus measure their anchors; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  navigation.params = new URLSearchParams()
  navigation.push.mockReset()
})

// jsdom applies no CSS, so the phone cards (md:hidden), the tablet "…"
// (md:max-xl) and the desktop columns are all in the tree at once; each test
// scopes to the layout it is about.
function renderCrm(ui: React.ReactNode) {
  return render(<CrmProvider nowMs={FIXED_NOW_MS}>{ui}</CrmProvider>)
}

const list = () => screen.getByRole("list")
const card = (title: string) => within(list()).getByRole("button", { name: new RegExp(`^${title}`) })

/** Contact detail and triage only have rows when the support inbox is connected. */
const LIVE = liveGmailSummary(FIXED_NOW_MS)
const ROSTER = "Roster import fails on a CSV with accents"
const roster = LIVE.data.cases.find((c) => c.subject === ROSTER)!
const dana = LIVE.data.contacts.find((c) => c.id === roster.contactId)!
const live = () => setGmailSummaryForTest(LIVE)

/**
 * Contacts the founder added by hand while Gmail is not connected: one
 * filed under an organization they typed, one without.
 */
function saveMine(): State {
  const at = new Date(FIXED_NOW_MS).toISOString()
  let s = initialState(FIXED_NOW_MS)
  s = reducer(s, {
    type: "add-contact",
    input: { email: "pat@example.org", firstName: "Pat", lastName: "Reyes", organizationName: "Katy ISD" },
    at,
  })
  s = reducer(s, { type: "add-contact", input: { email: "tom@example.com", firstName: "Tom", lastName: "Alvarez" }, at })
  saveState(window.localStorage, s)
  return s
}

describe("phone (<768): loading cards", () => {
  it("loading shows RowCollapse loading cards (Deke 8:236)", () => {
    render(<CrmTableSkeleton label="Loading saved cases" />)
    const status = screen.getByRole("status", { name: "Loading saved cases" })
    const cards = status.querySelectorAll(`[data-slot='${ROW_COLLAPSE_SLOT}'][data-state='loading']`)
    expect(cards).toHaveLength(5)
    expect(within(status).getByRole("list")).toHaveClass("md:hidden")
  })
})

describe("phone (<768): Contacts cards and sheet (the founder's own contacts)", () => {
  it("maps Name / Email / 'Organization · N open cases'; no plan pill (no Gmail source), no sample tag", () => {
    saveMine()
    renderCrm(<ContactsScreen />)
    expect(within(list()).getAllByRole("listitem")).toHaveLength(2)
    const pat = card("Pat Reyes")
    expect(pat).toHaveTextContent("pat@example.org")
    expect(pat).toHaveTextContent(/Katy ISD · 0 open cases/)
    expect(within(pat).queryByTestId("card-plan-pill")).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("plan-pill")).toHaveLength(0)
    expect(within(list()).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(card("Tom Alvarez")).toHaveTextContent(/No organization · 0 open cases/)
  })

  it("says one open case in the singular", () => {
    const tom = saveMine().contacts.find((c) => c.email === "tom@example.com")!
    expect(contactCardMeta(tom, null, 1)[1].value).toBe("No organization · 1 open case")
    expect(contactCardMeta(tom, null, 0)[1].value).toBe("No organization · 0 open cases")
  })

  it("the sheet offers Open, Edit (the existing form) and Delete (the existing confirm)", async () => {
    const user = userEvent.setup()
    const pat = saveMine().contacts.find((c) => c.email === "pat@example.org")!
    renderCrm(<ContactsScreen />)
    await user.click(card("Pat Reyes"))
    const sheet = await screen.findByRole("dialog", { name: "Pat Reyes" })
    const group = within(sheet).getByRole("group", { name: "Contact actions" })
    expect(within(group).getByRole("link", { name: "Open contact" })).toHaveAttribute("href", `/crm/contacts/${pat.id}`)
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Edit contact", "Delete contact"])

    await user.click(within(group).getByRole("button", { name: "Edit contact" }))
    const edit = await screen.findByRole("dialog", { name: "Edit contact" })
    expect(within(edit).getByLabelText("First name")).toHaveValue("Pat")
    expect(within(edit).getByLabelText("Organization")).toHaveValue("Katy ISD")
    expect(edit.className).toContain(CRM_DIALOG)
    // First / last name stack on a phone.
    expect(within(edit).getByLabelText("First name").closest(".grid")).toHaveClass("max-md:grid-cols-1")
    await user.clear(within(edit).getByLabelText("Last name"))
    await user.type(within(edit).getByLabelText("Last name"), "Reyes-Ortiz")
    await user.click(within(edit).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(card("Pat Reyes-Ortiz")).toBeInTheDocument())

    await user.click(card("Pat Reyes-Ortiz"))
    const again = await screen.findByRole("dialog", { name: "Pat Reyes-Ortiz" })
    await user.click(within(again).getByRole("button", { name: "Delete contact" }))
    const confirm = await screen.findByRole("dialog", { name: "Delete this contact?" })
    await user.click(within(confirm).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(1))
  })
})

describe("tablet (768–1279): Contacts table", () => {
  it("folds Email under Name and adds one '…' with Open / Edit / Delete", async () => {
    const user = userEvent.setup()
    saveMine()
    renderCrm(<ContactsScreen />)
    const table = screen.getByRole("table", { name: "Contacts" })
    const heads = within(table).getAllByRole("columnheader")
    expect(heads.map((h) => h.textContent)).toEqual(["Name", "Email", "Organization", "Open cases", "Actions"])
    expect(heads[1]).toHaveClass("md:max-xl:hidden")
    expect(heads[4]).toHaveClass("hidden", "md:max-xl:table-cell")
    await user.click(screen.getByRole("button", { name: "More actions for Pat Reyes" }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Open contact",
      "Edit contact",
      "Delete contact",
    ])
    await user.click(within(menu).getByRole("menuitem", { name: "Edit contact" }))
    const edit = await screen.findByRole("dialog", { name: "Edit contact" })
    expect(within(edit).getByLabelText("First name")).toHaveValue("Pat")
  })
})

describe("detail pages", () => {
  it("contact detail (live): the Cases table stacks as cards that open the case", async () => {
    const user = userEvent.setup()
    live()
    renderCrm(<ContactDetail contactId={dana.id} />)
    const cards = within(list()).getAllByRole("listitem")
    expect(cards.length).toBeGreaterThan(0)
    await user.click(card(ROSTER))
    // /crm/cases/<id> now redirects into the Cases panel.
    expect(navigation.push).toHaveBeenCalledWith(`/crm/cases/${roster.id}`)
    expect(card(ROSTER)).toHaveTextContent(new RegExp(`#${roster.caseNumber}.*priority · `))
  })

  it("contact detail (the founder's contact): Edit / Delete are 44 below 1280; Delete opens the extracted confirm", async () => {
    const user = userEvent.setup()
    const pat = saveMine().contacts.find((c) => c.email === "pat@example.org")!
    renderCrm(<ContactDetail contactId={pat.id} />)
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("max-xl:h-11!", "max-xl:min-w-11")
    const del = screen.getByRole("button", { name: "Delete Pat Reyes" })
    expect(del).toHaveClass("max-xl:h-11!")
    await user.click(del)
    const confirm = await screen.findByRole("dialog", { name: "Delete this contact?" })
    expect(within(confirm).getByRole("button", { name: "Keep them" })).toHaveClass("max-xl:h-11!")
  })
})

describe("shell, triage and error state", () => {
  it("header: Find a contact… (full width on a phone), ⋯ menu and tabs are 44 below 1280", async () => {
    const user = userEvent.setup()
    renderCrm(
      <CrmShell>
        <div />
      </CrmShell>
    )
    // jsdom applies no CSS, so both finders (desktop ⌘K one, phone full-width one) are in the tree.
    const [desktop, phone] = screen.getAllByRole("button", { name: /^Find a contact…/ })
    expect(desktop).toHaveClass("h-9!", "max-xl:h-11!", "max-md:hidden")
    expect(desktop).toHaveTextContent("⌘K")
    expect(phone).toHaveClass("h-11!", "w-full", "md:hidden")
    const menu = screen.getByRole("button", { name: CRM_MENU_LABEL })
    expect(menu).toHaveClass(CRM_ICON_44)
    await user.click(menu)
    const clear = await screen.findByRole("menuitem", { name: "Clear my entries" })
    expect(clear).toHaveClass(CRM_ROW_44)
    await user.keyboard("{Escape}")
    const tabs = within(screen.getByRole("navigation", { name: "CRM sections" })).getAllByRole("link")
    for (const tab of tabs) expect(tab).toHaveClass("max-xl:h-11", "max-xl:min-w-11", "shrink-0")
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Cases", "Accounts", "Triage", "Contacts"])
    // No Customers or Settings tab; the strip scrolls itself, with decorative fades.
    expect(screen.getByRole("navigation", { name: "CRM sections" })).toHaveClass("overflow-x-auto")
    for (const id of ["crm-tab-fade-start", "crm-tab-fade-end"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("aria-hidden")
      expect(screen.getByTestId(id)).toHaveClass("pointer-events-none")
    }
    // The section tabs are navigation, not a filter: no pressed restyle.
    expect(tabs[1].className).not.toContain("bg-primary")
  })

  it("triage (live): Promote / Link / More are 44 below 1280", async () => {
    const user = userEvent.setup()
    live()
    renderCrm(<TriageScreen />)
    const sam = screen.getByText("Sam Patel").closest("[data-slot=triage-card]") as HTMLElement
    expect(within(sam).getByRole("button", { name: "Promote to case" })).toHaveClass("max-xl:h-11!")
    expect(within(sam).getByRole("button", { name: "Link contact" })).toHaveClass("max-xl:h-11!")
    await user.click(within(sam).getByRole("button", { name: "More actions" }))
    const menu = await screen.findByRole("menu")
    for (const item of within(menu).getAllByRole("menuitem")) expect(item).toHaveClass("max-xl:min-h-11")
    expect(within(menu).getByRole("menuitem", { name: /Always ignore/ }).className).toContain(CRM_DANGER_TEXT)
  })

  it("error state: both buttons 44 below 1280, destructive text readable", () => {
    render(<CrmErrorAlert error={new Error("x")} onRetry={() => {}} onReset={() => {}} />)
    expect(screen.getByRole("button", { name: "Try again" })).toHaveClass("max-xl:h-11!")
    const reset = screen.getByRole("button", { name: "Reset and clear saved copy" })
    expect(reset).toHaveClass("max-xl:h-11!")
    expect(reset.className).toContain(CRM_DANGER_TEXT)
  })
})
