import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AccountOrg, AccountUser, AccountsResponse } from "@/lib/crm/accounts/model"
import { AccountDetail } from "@/components/crm/accounts/account-detail"
import { AccountsScreen, NO_ORGS_TITLE, noMatchTitle } from "@/components/crm/accounts/accounts-screen"

const FIXED_NOW_MS = Date.parse("2026-10-27T12:00:00.000Z")
vi.mock("@/lib/clock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clock")>()
  return { ...actual, now: () => new Date(FIXED_NOW_MS) }
})

// Test-only rows, handed to a mocked fetch; never shipped.
const at = (days: number) => new Date(FIXED_NOW_MS + days * 86_400_000).toISOString()
const user = (id: string, name: string, org: string | null): AccountUser => ({
  id,
  name,
  email: `${id}@test.invalid`,
  organization: org,
  plan: "Monthly",
  planStatus: "active",
})
function org(o: Partial<AccountOrg> & { id: string; name: string }): AccountOrg {
  return {
    domain: null,
    stripeCustomerId: "cus_T1",
    status: "active",
    canceled: false,
    plan: "Monthly",
    mrrCents: 7_500,
    openCases: 1,
    users: [],
    ...o,
  }
}

const westside = org({ id: "o-west", name: "Westside High", users: [user("u1", "Marcus Hill", "Westside High"), user("u2", "Dana Ortiz", "Westside High")] })
const lakeview = org({ id: "o-lake", name: "lakeview Middle", users: [user("u3", "Kim Nguyen", "lakeview Middle")] })
const oak = org({ id: "o-oak", name: "Oak Hollow" })
const birch = org({ id: "o-birch", name: "Birchwood Labs", canceled: true, status: "canceled", mrrCents: 0, users: [user("u4", "Ana Ruiz", "Birchwood Labs")] })

const LIVE: AccountsResponse = {
  status: "connected",
  missing: [],
  lastSyncedAt: at(0),
  lastTriedAt: null,
  stripeContacts: 7,
  orgs: [westside, birch, oak, lakeview],
  noOrgUsers: [user("u9", "Greg Tan", null)],
}

let body: unknown
let status: number
beforeEach(() => {
  status = 200
  body = LIVE
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  )
})
afterEach(() => vi.unstubAllGlobals())

async function renderScreen() {
  render(<AccountsScreen />)
  await act(async () => {})
}

const orgNames = () => screen.getAllByTestId("org-row").map((r) => within(r).getByRole("link").textContent)

describe("Accounts screen", () => {
  it("lists orgs A to Z by name, case-insensitively, with users, plan and MRR; no seats or dates", async () => {
    await renderScreen()
    expect(orgNames()).toEqual(["Birchwood Labs", "lakeview Middle", "Oak Hollow", "Westside High"])
    const headers = within(screen.getByRole("table", { name: "Organizations" }))
      .getAllByRole("columnheader")
      .map((h) => h.textContent)
    expect(headers).toEqual(["", "Organization", "Users", "Plan", "MRR"])
    const birchRow = screen.getAllByTestId("org-row")[0]!
    expect(within(birchRow).getByText("Canceled")).toBeInTheDocument()
    const westRow = screen.getAllByTestId("org-row")[3]!
    expect(westRow).toHaveTextContent("2")
    expect(westRow).toHaveTextContent("$75")
    expect(screen.queryByTestId("seat-chip")).toBeNull()
    expect(screen.queryByTestId("renewal-tag")).toBeNull()
    expect(screen.queryByText(/seat/i)).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Sort organizations" })).toBeNull()
  })

  it("summary tiles: organizations, users attached, users with no org", async () => {
    await renderScreen()
    expect(screen.getByTestId("tile-organizations")).toHaveTextContent("4")
    expect(screen.getByTestId("tile-users-attached")).toHaveTextContent("4")
    expect(screen.getByTestId("tile-users-no-org")).toHaveTextContent("1")
    expect(within(screen.getByRole("region", { name: "Accounts summary" })).getAllByTestId(/^tile-/)).toHaveLength(3)
  })

  it("expands a row to its users and an Open organization link", async () => {
    await renderScreen()
    const toggle = screen.getByRole("button", { name: "Show users of Westside High" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(toggle)
    expect(screen.getByRole("button", { name: "Hide users of Westside High" })).toHaveAttribute("aria-expanded", "true")
    const users = screen.getByRole("table", { name: "Users of Westside High" })
    expect(within(users).getByText("Marcus Hill")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /Open organization/ })[0]).toHaveAttribute("href", "/crm/accounts/o-west")
  })

  it("tabs: Canceled and No organization; no seat tabs", async () => {
    await renderScreen()
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.queryByRole("tab", { name: /Open seats|Full|Over/ })).toBeNull()
    fireEvent.click(screen.getByRole("tab", { name: /Canceled/ }))
    expect(orgNames()).toEqual(["Birchwood Labs"])
    fireEvent.click(screen.getByRole("tab", { name: /No organization/ }))
    expect(screen.queryAllByTestId("org-row")).toHaveLength(0)
    expect(within(screen.getByRole("table", { name: "Users with no organization" })).getByText("Greg Tan")).toBeInTheDocument()
  })

  it("the No organization row sits under the orgs on All", async () => {
    await renderScreen()
    expect(screen.getByTestId("no-org-row")).toHaveTextContent("No organization")
    expect(screen.getByTestId("no-org-row")).toHaveTextContent("1")
  })

  it("search matches orgs and users; no match shows the empty state with Clear search", async () => {
    await renderScreen()
    const box = screen.getByRole("searchbox", { name: "Search organizations or users" })
    fireEvent.change(box, { target: { value: "dana" } })
    expect(orgNames()).toEqual(["Westside High"])
    fireEvent.change(box, { target: { value: "zephyr academy" } })
    expect(screen.getByTestId("accounts-no-results")).toHaveTextContent(noMatchTitle("zephyr academy"))
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(orgNames()).toHaveLength(4)
  })

  it("no orgs: the empty state, and a way to the users with no org", async () => {
    body = { ...LIVE, orgs: [] }
    await renderScreen()
    expect(screen.getByTestId("accounts-empty")).toHaveTextContent(NO_ORGS_TITLE)
    fireEvent.click(screen.getByRole("button", { name: "View 1 users with no org" }))
    expect(screen.getByRole("table", { name: "Users with no organization" })).toBeInTheDocument()
  })

  it("not connected: a Not connected panel and tiles, never a figure", async () => {
    body = { status: "not_connected", missing: ["stripe"], lastSyncedAt: null, lastTriedAt: null, stripeContacts: 0, orgs: [], noOrgUsers: [] }
    await renderScreen()
    expect(screen.getByTestId("accounts-not-connected")).toBeInTheDocument()
    for (const id of ["tile-organizations", "tile-users-attached", "tile-users-no-org"]) {
      expect(within(screen.getByTestId(id)).getByTestId("not-connected")).toBeInTheDocument()
    }
    expect(screen.queryByTestId("org-row")).toBeNull()
  })

  it("a failed read with nothing yet is Not connected, never a raw error", async () => {
    status = 500
    body = { error: "boom" }
    await renderScreen()
    expect(screen.getByTestId("accounts-not-connected")).toBeInTheDocument()
    expect(screen.queryByText(/boom/)).toBeNull()
  })

  it("shows when a failed source was last tried", async () => {
    body = { status: "not_connected", missing: [], lastSyncedAt: null, lastTriedAt: at(-5 / 1440), stripeContacts: 0, orgs: [], noOrgUsers: [] }
    await renderScreen()
    expect(screen.getByTestId("accounts-last-tried")).toHaveTextContent(/Last tried 5m ago/)
  })

  it("the login gate's 401 is Your session expired", async () => {
    status = 401
    body = { error: "Locked" }
    await renderScreen()
    expect(screen.getByTestId("crm-session-expired")).toBeInTheDocument()
  })
})

describe("Organization detail", () => {
  async function renderDetail(o: AccountOrg | null, s = "connected") {
    body = { status: s, missing: [], lastSyncedAt: at(0), lastTriedAt: null, org: o }
    render(<AccountDetail orgId={o?.id ?? "x"} />)
    await act(async () => {})
  }

  it("shows the org, its users, MRR and open cases; read-only, no seats or dates", async () => {
    await renderDetail(westside)
    expect(screen.getByRole("heading", { level: 1, name: "Westside High" })).toBeInTheDocument()
    expect(screen.getByText("Users", { selector: "span" }).parentElement).toHaveTextContent("2")
    expect(screen.getByText("MRR").parentElement).toHaveTextContent("$75")
    expect(screen.queryByTestId("add-seats")).toBeNull()
    expect(screen.queryByTestId("seats-hero")).toBeNull()
    expect(screen.queryByText(/seat|renews|customer since|started/i)).toBeNull()
    expect(screen.getByRole("link", { name: /Accounts/ })).toHaveAttribute("href", "/crm/accounts")
  })

  it("Open cases says Not connected when cases could not be read", async () => {
    await renderDetail(org({ id: "o-nc", name: "NC", openCases: null }))
    expect(screen.getByText("Open cases").parentElement).toHaveTextContent("Not connected")
  })

  it("searches its users", async () => {
    await renderDetail(westside)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), { target: { value: "dana" } })
    const table = screen.getByRole("table", { name: "Users of Westside High" })
    expect(within(table).queryByText("Marcus Hill")).toBeNull()
    expect(within(table).getByText("Dana Ortiz")).toBeInTheDocument()
  })

  it("not connected and unknown ids are honest states", async () => {
    await renderDetail(null, "not_connected")
    expect(screen.getByTestId("accounts-not-connected")).toBeInTheDocument()
  })
})
