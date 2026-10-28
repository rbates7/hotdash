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
  startedAt: "2025-03-10T00:00:00.000Z",
  plan: "Monthly",
  planStatus: "active",
})
function org(o: Partial<AccountOrg> & { id: string; name: string }): AccountOrg {
  return {
    domain: null,
    stripeCustomerId: "cus_T1",
    subscriptionId: "sub_T1",
    status: "active",
    canceled: false,
    plan: "Monthly",
    interval: "month",
    seatsUsed: 0,
    seatsTotal: 5,
    seatMonthlyCents: 1_500,
    customerSince: "2025-03-01T00:00:00.000Z",
    renewsAt: at(200),
    renewalKind: "renews",
    termMonths: 12,
    mrrCents: 7_500,
    openCases: 1,
    users: [],
    ...o,
  }
}

const westside = org({ id: "o-west", name: "Westside High", seatsUsed: 2, seatsTotal: 2, users: [user("u1", "Marcus Hill", "Westside High"), user("u2", "Dana Ortiz", "Westside High")] })
const lakeview = org({ id: "o-lake", name: "Lakeview Middle", seatsUsed: 1, seatsTotal: 5, renewsAt: at(13), users: [user("u3", "Kim Nguyen", "Lakeview Middle")] })
const oak = org({ id: "o-oak", name: "Oak Hollow", seatsUsed: 4, seatsTotal: 3, renewsAt: at(90) })
const birch = org({ id: "o-birch", name: "Birchwood Labs", seatsUsed: 3, seatsTotal: 3, canceled: true, status: "canceled", renewsAt: at(-27), renewalKind: "ended" })

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
  it("lists orgs sorted by soonest renewal, canceled last, with the right chips and tags", async () => {
    await renderScreen()
    expect(orgNames()).toEqual(["Lakeview Middle", "Oak Hollow", "Westside High", "Birchwood Labs"])
    const lake = screen.getAllByTestId("org-row")[0]!
    expect(within(lake).getByTestId("seat-chip")).toHaveTextContent("4 open")
    expect(within(lake).getByTestId("renewal-tag")).toHaveTextContent("in 13 days")
    const oakRow = screen.getAllByTestId("org-row")[1]!
    expect(within(oakRow).getByTestId("seat-chip")).toHaveTextContent("+1 over")
    expect(within(screen.getAllByTestId("org-row")[2]!).getByTestId("seat-chip")).toHaveTextContent("Full")
    const birchRow = screen.getAllByTestId("org-row")[3]!
    expect(within(birchRow).queryByTestId("seat-chip")).toBeNull()
    expect(within(birchRow).getByText("Canceled")).toBeInTheDocument()
    expect(within(birchRow).getByTestId("renewal-tag")).toHaveTextContent("Lapsed")
  })

  it("summary tiles add up the live seats", async () => {
    await renderScreen()
    expect(screen.getByTestId("tile-organizations")).toHaveTextContent("4")
    expect(screen.getByTestId("tile-total-seats")).toHaveTextContent("10")
    expect(screen.getByTestId("tile-seats-used")).toHaveTextContent("7")
    expect(screen.getByTestId("tile-open-seats")).toHaveTextContent("4")
    expect(screen.getByTestId("tile-users-no-org")).toHaveTextContent("1")
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

  it("tabs filter by seat state, and No organization lists those users", async () => {
    await renderScreen()
    fireEvent.click(screen.getByRole("tab", { name: /Over limit/ }))
    expect(orgNames()).toEqual(["Oak Hollow"])
    fireEvent.click(screen.getByRole("tab", { name: /Canceled/ }))
    expect(orgNames()).toEqual(["Birchwood Labs"])
    fireEvent.click(screen.getByRole("tab", { name: /No organization/ }))
    expect(screen.queryAllByTestId("org-row")).toHaveLength(0)
    expect(within(screen.getByRole("table", { name: "Users with no organization" })).getByText("Greg Tan")).toBeInTheDocument()
  })

  it("the Renews header toggles the sort; the sort control picks others", async () => {
    await renderScreen()
    fireEvent.click(screen.getByRole("button", { name: "Renews" }))
    expect(orgNames()).toEqual(["Westside High", "Oak Hollow", "Lakeview Middle", "Birchwood Labs"])
    fireEvent.change(screen.getByRole("combobox", { name: "Sort organizations" }), { target: { value: "name" } })
    expect(orgNames()).toEqual(["Birchwood Labs", "Lakeview Middle", "Oak Hollow", "Westside High"])
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
    expect(within(screen.getByTestId("tile-total-seats")).getByTestId("not-connected")).toBeInTheDocument()
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

  it("Add seats links to the subscription in Stripe's dashboard, in a new tab; it never writes", async () => {
    await renderDetail(westside)
    const add = screen.getByTestId("add-seats")
    expect(add.tagName).toBe("A")
    expect(add).toHaveAttribute("href", "https://dashboard.stripe.com/subscriptions/sub_T1")
    expect(add).toHaveAttribute("target", "_blank")
    expect(add).toHaveAttribute("rel", expect.stringContaining("noopener"))
    expect(screen.getByTestId("seats-hero")).toHaveTextContent("Full")
    expect(screen.getByRole("link", { name: /Accounts/ })).toHaveAttribute("href", "/crm/accounts")
  })

  it("Add seats is disabled without a subscription", async () => {
    await renderDetail(org({ id: "o-none", name: "None", subscriptionId: null, seatsTotal: null }))
    expect(screen.getByTestId("add-seats")).toBeDisabled()
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
