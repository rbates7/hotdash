import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { liveGmailSummary, setGmailSummaryForTest } from "@/test/gmail"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { PlanBadge } from "@/components/crm/case-badges"
import { ContactDetail } from "@/components/crm/contact-detail"
import { CARD_PLAN_PILL, ContactsScreen, contactCardMeta } from "@/components/crm/contacts-screen"
import { CrmErrorAlert } from "@/components/crm/crm-error-alert"
import { CrmShell } from "@/components/crm/crm-shell"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"
import { CrmProvider, initialState, reducer, saveState, type State } from "@/components/crm/crm-store"
import { CRM_DANGER_TEXT, CRM_DIALOG, CRM_RESET } from "@/components/crm/crm-touch"
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
  it("maps Name / Email / 'Organization · N open cases'; no plan pill without a plan, no sample tag", () => {
    saveMine()
    renderCrm(<ContactsScreen />)
    expect(within(list()).getAllByRole("listitem")).toHaveLength(2)
    const pat = card("Pat Reyes")
    expect(pat).toHaveTextContent("pat@example.org")
    expect(pat).toHaveTextContent(/Katy ISD · 0 open cases/)
    expect(within(pat).queryByTestId(CARD_PLAN_PILL)).not.toBeInTheDocument()
    expect(screen.queryAllByTestId("plan-pill")).toHaveLength(0)
    expect(within(list()).queryByTestId("sample-data-tag")).not.toBeInTheDocument()
    expect(card("Tom Alvarez")).toHaveTextContent(/No organization · 0 open cases/)
  })

  it("the plan pill renders under the id a card passes, so the table's `plan-pill` count stays its own", () => {
    render(<PlanBadge plan="Monthly" planStatus="active" testId={CARD_PLAN_PILL} />)
    expect(screen.getByTestId(CARD_PLAN_PILL)).toHaveTextContent("Monthly")
    expect(screen.queryByTestId("plan-pill")).not.toBeInTheDocument()
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
    expect(heads.map((h) => h.textContent)).toEqual(["Name", "Email", "Organization", "Plan", "Open cases", "Actions"])
    expect(heads[1]).toHaveClass("md:max-xl:hidden")
    expect(heads[5]).toHaveClass("hidden", "md:max-xl:table-cell")
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
  it("header: Search is icon-only on a phone but keeps its name; Clear my entries and tabs are 44 below 1280", () => {
    renderCrm(
      <CrmShell>
        <div />
      </CrmShell>
    )
    // jsdom applies no CSS, so the ⌘K hint (hidden on a phone) is in the name here.
    const search = screen.getByRole("button", { name: /^Search/ })
    expect(search).toHaveClass("max-md:size-11!", "max-xl:h-11!")
    expect(within(search).getByText("Search")).toHaveClass("max-md:sr-only")
    const clear = screen.getByRole("button", { name: "Clear my entries" })
    for (const cls of CRM_RESET.split(" ")) expect(clear).toHaveClass(cls)
    const tabs = within(screen.getByRole("navigation", { name: "CRM sections" })).getAllByRole("link")
    for (const tab of tabs) expect(tab).toHaveClass("max-xl:min-h-11", "max-xl:min-w-11", "shrink-0")
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Cases", "Accounts", "Contacts", "Triage"])
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
