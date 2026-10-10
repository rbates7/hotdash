import * as React from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { navigation } from "@/test/setup"
import { FIXED_NOW_MS } from "@/test/clock"
import { orgOf } from "@/lib/crm/crm"
import { seedCases, seedContacts, seedOrganizations } from "@/lib/crm/fixture"
import { ROW_COLLAPSE_SLOT } from "@/components/responsive-table"
import { SAMPLE_DATA_LABEL } from "@/components/sample-data"
import { CaseDetail } from "@/components/crm/case-detail"
import { CasesScreen, caseCardMeta } from "@/components/crm/cases-screen"
import { ContactDetail } from "@/components/crm/contact-detail"
import { CARD_PLAN_PILL, ContactsScreen, contactCardMeta } from "@/components/crm/contacts-screen"
import { CrmErrorAlert } from "@/components/crm/crm-error-alert"
import { CrmShell } from "@/components/crm/crm-shell"
import { CrmTableSkeleton } from "@/components/crm/crm-skeleton"
import { CrmProvider } from "@/components/crm/crm-store"
import { CRM_DANGER_TEXT, CRM_DIALOG, CRM_RESET } from "@/components/crm/crm-touch"
import { TriageScreen } from "@/components/crm/triage-screen"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/crm/cases",
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

const STAFF_SEATS = "Staff seats invite fails on the iPad"

describe("phone (<768): Cases cards", () => {
  it("maps Subject / Status / '#N · Contact · Org' / 'Priority priority · last activity', tagged on seed rows", () => {
    renderCrm(<CasesScreen />)
    const items = within(list()).getAllByRole("listitem")
    expect(items).toHaveLength(8)
    expect(items.map((c) => c.querySelector(`[data-slot='${ROW_COLLAPSE_SLOT}']`))).not.toContain(null)

    const staff = card(STAFF_SEATS)
    expect(within(staff).getByTestId("status-pill")).toHaveTextContent("Open")
    expect(staff).toHaveTextContent("#1 · Marcus Hale · Westfield HS")
    expect(staff).toHaveTextContent(/High priority · \d+[mhd] ago/)
    expect(within(staff).getByTestId("sample-data-tag")).toHaveTextContent(SAMPLE_DATA_LABEL)
    // Meta lines are labelled for screen readers.
    expect(within(staff).getByText("Case:", { exact: false })).toHaveClass("sr-only")
    expect(within(staff).getByText("Priority:", { exact: false })).toHaveClass("sr-only")
  })

  it("falls back to the contact's email when there is no organization", () => {
    const contacts = seedContacts(FIXED_NOW_MS)
    const orgs = seedOrganizations(FIXED_NOW_MS)
    const tom = contacts.find((c) => c.email === "tom.alvarez@gmail.com")!
    const tomCase = seedCases(FIXED_NOW_MS).find((c) => c.contactId === tom.id)!
    const [first, second] = caseCardMeta(tomCase, tom, orgOf(orgs, tom.organizationId), FIXED_NOW_MS)
    expect(first.value).toBe(`#${tomCase.caseNumber} · Tom Alvarez · tom.alvarez@gmail.com`)
    expect(second.value).toMatch(/^Normal priority · /)
  })

  it("loading shows RowCollapse loading cards (Deke 8:236)", () => {
    render(<CrmTableSkeleton label="Loading saved cases" />)
    const status = screen.getByRole("status", { name: "Loading saved cases" })
    const cards = status.querySelectorAll(`[data-slot='${ROW_COLLAPSE_SLOT}'][data-state='loading']`)
    expect(cards).toHaveLength(5)
    expect(within(status).getByRole("list")).toHaveClass("md:hidden")
  })
})

describe("phone (<768): the Cases bottom sheet", () => {
  it("opens from a card, titled by the subject, with the summary and every desktop action", async () => {
    const user = userEvent.setup()
    renderCrm(<CasesScreen />)
    await user.click(card(STAFF_SEATS))
    const sheet = await screen.findByRole("dialog", { name: STAFF_SEATS })
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet.className).toContain("max-xl:[&>[data-slot=sheet-close]]:size-11!")
    expect(within(sheet).getByTestId("status-pill")).toHaveTextContent("Open")
    expect(sheet).toHaveTextContent("#1 · Marcus Hale · Westfield HS")
    expect(sheet).toHaveTextContent(/High priority · /)
    const group = within(sheet).getByRole("group", { name: "Case actions" })
    const open = within(group).getByRole("link", { name: "Open case" })
    expect(open).toHaveAttribute("href", "/crm/cases/case-1")
    const del = within(group).getByRole("button", { name: "Delete case" })
    expect(del).toHaveClass("text-danger-text", "h-12")
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument()
  })

  it("Delete case opens the existing confirm; Delete removes the card", async () => {
    const user = userEvent.setup()
    renderCrm(<CasesScreen />)
    await user.click(card(STAFF_SEATS))
    const sheet = await screen.findByRole("dialog", { name: STAFF_SEATS })
    await user.click(within(sheet).getByRole("button", { name: "Delete case" }))
    const confirm = await screen.findByRole("dialog", { name: "Delete this case?" })
    expect(confirm).toHaveTextContent(`#1 ${STAFF_SEATS} comes off the list`)
    expect(confirm.className).toContain(CRM_DIALOG)
    const deleteButton = within(confirm).getByRole("button", { name: "Delete" })
    expect(deleteButton.className).toContain(CRM_DANGER_TEXT)
    expect(deleteButton.className).toContain("max-xl:h-11!")
    await user.click(deleteButton)
    await waitFor(() => expect(within(list()).queryByRole("button", { name: new RegExp(`^${STAFF_SEATS}`) })).toBeNull())
    expect(within(list()).getAllByRole("listitem")).toHaveLength(7)
  })
})

describe("tablet (768–1279): Cases table", () => {
  it("hides # and Last activity, folds them into the Subject subline, and adds one '…' column", () => {
    renderCrm(<CasesScreen />)
    const table = screen.getByRole("table", { name: "Cases" })
    const heads = within(table).getAllByRole("columnheader")
    expect(heads.map((h) => h.textContent)).toEqual([
      "#",
      "Subject",
      "Contact",
      "Status",
      "Priority",
      "Last activity",
      "Actions",
    ])
    expect(heads[0]).toHaveClass("md:max-xl:hidden")
    expect(heads[5]).toHaveClass("md:max-xl:hidden")
    expect(heads[6]).toHaveClass("hidden", "md:max-xl:table-cell")
    const row = within(table).getByRole("row", { name: new RegExp(STAFF_SEATS) })
    const subject = within(row).getAllByRole("link").find((l) => l.textContent?.includes(STAFF_SEATS))!
    expect(within(subject).getByText(/^#1 · \d+[mhd] ago$/)).toHaveClass("hidden", "md:max-xl:inline")
    // One tag per seed row: it reflows into the subline instead of being duplicated.
    expect(within(table).getAllByTestId("sample-data-tag")).toHaveLength(8)
  })

  it("the '…' menu offers Open case and Delete case; Open case navigates", async () => {
    const user = userEvent.setup()
    renderCrm(<CasesScreen />)
    const more = screen.getByRole("button", { name: `More actions for #1 ${STAFF_SEATS}` })
    expect(more).toHaveClass("size-11!")
    await user.click(more)
    const menu = await screen.findByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((i) => i.textContent)).toEqual(["Open case", "Delete case"])
    for (const item of items) expect(item).toHaveClass("min-h-11")
    expect(items[1].className).toContain(CRM_DANGER_TEXT)
    await user.click(items[0])
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases/case-1")
  })

  it("the '…' Delete case opens the same confirm", async () => {
    const user = userEvent.setup()
    renderCrm(<CasesScreen />)
    await user.click(screen.getByRole("button", { name: `More actions for #1 ${STAFF_SEATS}` }))
    await user.click(await screen.findByRole("menuitem", { name: "Delete case" }))
    expect(await screen.findByRole("dialog", { name: "Delete this case?" })).toBeInTheDocument()
  })
})

describe("Cases toolbar", () => {
  it("the picked status reads as pressed at every width; segments, select and search are 44 below 1280", () => {
    navigation.params = new URLSearchParams("status=open")
    renderCrm(<CasesScreen />)
    const nav = screen.getByRole("navigation", { name: "Case status filter" })
    const pressed = within(nav).getByRole("link", { name: "Open" })
    expect(pressed).toHaveAttribute("aria-current", "page")
    for (const link of within(nav).getAllByRole("link")) {
      expect(link).toHaveClass(
        "aria-[current=page]:bg-primary!",
        "aria-[current=page]:text-primary-foreground!",
        "max-xl:min-h-11",
        "max-xl:min-w-11"
      )
    }
    expect(within(nav).getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("combobox", { name: "Priority filter" })).toHaveClass("max-xl:h-11!")
    expect(screen.getByRole("textbox", { name: "Search cases" })).toHaveClass("max-xl:h-11!", "max-xl:w-full")
    // Phone: status and priority share one sideways-scrolling strip.
    const strip = nav.closest("[data-slot='cases-filter-strip']")!
    expect(strip).toHaveClass("contents", "max-md:overflow-x-auto")
    expect(strip).toContainElement(screen.getByRole("combobox", { name: "Priority filter" }))
  })
})

describe("phone (<768): Contacts cards and sheet", () => {
  it("maps Name / Plan / Email / 'Organization · N open cases', tagged on seed rows", () => {
    renderCrm(<ContactsScreen />)
    expect(within(list()).getAllByRole("listitem")).toHaveLength(6)
    const marcus = card("Marcus Hale")
    expect(within(marcus).getByTestId(CARD_PLAN_PILL)).toBeInTheDocument()
    // `plan-pill` still counts the table column's six.
    expect(screen.getAllByTestId("plan-pill")).toHaveLength(6)
    expect(marcus).toHaveTextContent("mhale@westfieldfb.org")
    expect(marcus).toHaveTextContent(/Westfield HS · \d+ open cases?/)
    expect(within(marcus).getByTestId("sample-data-tag")).toBeInTheDocument()
    expect(card("Tom Alvarez")).toHaveTextContent(/No organization · \d+ open cases?/)
  })

  it("says one open case in the singular", () => {
    const tom = seedContacts(FIXED_NOW_MS).find((c) => c.email === "tom.alvarez@gmail.com")!
    expect(contactCardMeta(tom, null, 1)[1].value).toBe("No organization · 1 open case")
    expect(contactCardMeta(tom, null, 0)[1].value).toBe("No organization · 0 open cases")
  })

  it("the sheet offers Open, Edit (the existing form) and Delete (the existing confirm)", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    await user.click(card("Marcus Hale"))
    const sheet = await screen.findByRole("dialog", { name: "Marcus Hale" })
    const group = within(sheet).getByRole("group", { name: "Contact actions" })
    expect(within(group).getByRole("link", { name: "Open contact" })).toHaveAttribute("href", "/crm/contacts/contact-1")
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Edit contact", "Delete contact"])

    await user.click(within(group).getByRole("button", { name: "Edit contact" }))
    const edit = await screen.findByRole("dialog", { name: "Edit contact" })
    expect(within(edit).getByLabelText("First name")).toHaveValue("Marcus")
    expect(within(edit).getByLabelText("Organization")).toHaveValue("Westfield HS")
    expect(edit.className).toContain(CRM_DIALOG)
    // First / last name stack on a phone.
    expect(within(edit).getByLabelText("First name").closest(".grid")).toHaveClass("max-md:grid-cols-1")
    await user.clear(within(edit).getByLabelText("Last name"))
    await user.type(within(edit).getByLabelText("Last name"), "Hale-Ortiz")
    await user.click(within(edit).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(card("Marcus Hale-Ortiz")).toBeInTheDocument())

    await user.click(card("Marcus Hale-Ortiz"))
    const again = await screen.findByRole("dialog", { name: "Marcus Hale-Ortiz" })
    await user.click(within(again).getByRole("button", { name: "Delete contact" }))
    const confirm = await screen.findByRole("dialog", { name: "Delete this contact?" })
    await user.click(within(confirm).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(5))
  })
})

describe("tablet (768–1279): Contacts table", () => {
  it("folds Email under Name and adds one '…' with Open / Edit / Delete", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactsScreen />)
    const table = screen.getByRole("table", { name: "Contacts" })
    const heads = within(table).getAllByRole("columnheader")
    expect(heads.map((h) => h.textContent)).toEqual(["Name", "Email", "Organization", "Plan", "Open cases", "Actions"])
    expect(heads[1]).toHaveClass("md:max-xl:hidden")
    expect(heads[5]).toHaveClass("hidden", "md:max-xl:table-cell")
    await user.click(screen.getByRole("button", { name: "More actions for Marcus Hale" }))
    const menu = await screen.findByRole("menu")
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Open contact",
      "Edit contact",
      "Delete contact",
    ])
    await user.click(within(menu).getByRole("menuitem", { name: "Edit contact" }))
    const edit = await screen.findByRole("dialog", { name: "Edit contact" })
    expect(within(edit).getByLabelText("First name")).toHaveValue("Marcus")
  })
})

describe("detail pages", () => {
  it("contact detail: the Cases table stacks as cards that open the case", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactDetail contactId="contact-1" />)
    const cards = within(list()).getAllByRole("listitem")
    expect(cards.length).toBeGreaterThan(0)
    await user.click(card(STAFF_SEATS))
    expect(navigation.push).toHaveBeenCalledWith("/crm/cases/case-1")
    expect(card(STAFF_SEATS)).toHaveTextContent(/^.*#1.*priority · /)
  })

  it("contact detail: Edit / Delete are 44 below 1280; Delete opens the extracted confirm", async () => {
    const user = userEvent.setup()
    renderCrm(<ContactDetail contactId="contact-1" />)
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("max-xl:h-11!", "max-xl:min-w-11")
    const del = screen.getByRole("button", { name: "Delete Marcus Hale" })
    expect(del).toHaveClass("max-xl:h-11!")
    await user.click(del)
    const confirm = await screen.findByRole("dialog", { name: "Delete this contact?" })
    expect(within(confirm).getByRole("button", { name: "Keep them" })).toHaveClass("max-xl:h-11!")
  })

  it("case detail: status steps, priority, note delete, Add note and Delete are 44; the note box only has a min height", async () => {
    const user = userEvent.setup()
    renderCrm(<CaseDetail caseId="case-1" />)
    for (const step of within(screen.getByRole("group", { name: "Case status" })).getAllByRole("button")) {
      expect(step).toHaveClass("max-xl:h-11")
    }
    expect(screen.getByRole("combobox", { name: "Priority" })).toHaveClass("max-xl:h-11!")
    for (const del of screen.getAllByRole("button", { name: "Delete note" })) {
      expect(del).toHaveClass("max-xl:size-11!")
    }
    expect(screen.getByRole("button", { name: "Add note" })).toHaveClass("max-xl:h-11!")
    const note = screen.getByLabelText("Internal note")
    expect(note).toHaveClass("min-h-16", "field-sizing-content")
    expect(note.className).not.toMatch(/(^|\s)(max-xl:)?h-\d/)
    await user.click(screen.getByRole("button", { name: "Delete case #1" }))
    const confirm = await screen.findByRole("dialog", { name: "Delete this case?" })
    expect(within(confirm).getByRole("button", { name: "Keep it" })).toHaveClass("max-xl:h-11!")
  })
})

describe("shell, triage and error state", () => {
  it("header: Search is icon-only on a phone but keeps its name; Reset and tabs are 44 below 1280", () => {
    renderCrm(
      <CrmShell>
        <div />
      </CrmShell>
    )
    // jsdom applies no CSS, so the ⌘K hint (hidden on a phone) is in the name here.
    const search = screen.getByRole("button", { name: /^Search/ })
    expect(search).toHaveClass("max-md:size-11!", "max-xl:h-11!")
    expect(within(search).getByText("Search")).toHaveClass("max-md:sr-only")
    const reset = screen.getByRole("button", { name: "Reset" })
    for (const cls of CRM_RESET.split(" ")) expect(reset).toHaveClass(cls)
    const tabs = within(screen.getByRole("navigation", { name: "CRM sections" })).getAllByRole("link")
    for (const tab of tabs) expect(tab).toHaveClass("max-xl:min-h-11", "max-md:flex-1")
    // The section tabs are navigation, not a filter: no pressed restyle.
    expect(tabs[1].className).not.toContain("bg-primary")
  })

  it("triage: Promote / Link / More are 44 below 1280", async () => {
    const user = userEvent.setup()
    renderCrm(<TriageScreen />)
    const riley = screen.getByText("Riley Nash").closest("[data-slot=triage-card]") as HTMLElement
    expect(within(riley).getByRole("button", { name: "Promote to case" })).toHaveClass("max-xl:h-11!")
    expect(within(riley).getByRole("button", { name: "Link contact" })).toHaveClass("max-xl:h-11!")
    await user.click(within(riley).getByRole("button", { name: "More actions" }))
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
