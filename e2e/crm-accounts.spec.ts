import { expect, test, type Page } from "@playwright/test"

import { pageOverflowX } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"

/**
 * Accounts (`/crm/accounts`). The server Playwright starts has no Stripe key
 * and no CRM database, so unmocked it is Not connected. Every other state
 * mocks `/api/crm/accounts` in the browser with test-only rows (`.invalid`
 * addresses, never real customers).
 */

const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM", exact: true })
const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

function user(id: string, name: string, org: string | null) {
  return { id, name, email: `${id}@test.invalid`, organization: org, plan: "Monthly", planStatus: "active" }
}

function org(id: string, name: string, o: Record<string, unknown> = {}) {
  return {
    id,
    name,
    domain: `${id}.invalid`,
    stripeCustomerId: "cus_TEST",
    status: "active",
    canceled: false,
    plan: "Monthly",
    mrrCents: 4500,
    openCases: 0,
    users: [user(`${id}-u1`, `Test Person ${id}`, name)],
    ...o,
  }
}

const LIVE = {
  status: "connected",
  missing: [],
  lastSyncedAt: at(0),
  lastTriedAt: null,
  stripeContacts: 5,
  // Out of order on purpose: the screen sorts A to Z, case-insensitively.
  orgs: [
    org("t-charlie", "Test Org Charlie"),
    org("t-delta", "Test Org Delta", { canceled: true, status: "canceled", mrrCents: 0 }),
    org("t-alpha", "test org alpha"),
    org("t-bravo", "Test Org Bravo", {
      users: [user("t-bravo-u1", "Test Person t-bravo", "Test Org Bravo"), user("t-bravo-u2", "Test Person Two", "Test Org Bravo")],
    }),
  ],
  noOrgUsers: [user("t-loose", "Test Loose User", null)],
}

const EMPTY = { ...LIVE, stripeContacts: 0, orgs: [], noOrgUsers: [] }

async function mockAccounts(page: Page, body: unknown) {
  await page.route("**/api/crm/accounts", (route) => route.fulfill({ json: body }))
  await page.route("**/api/crm/accounts/*", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!)
    const found = (body as typeof LIVE).orgs.find((o) => o.id === id) ?? null
    return route.fulfill({ status: found ? 200 : 404, json: { ...(body as object), org: found } })
  })
}

test.describe("CRM Accounts", () => {
  test("sits right after Dashboard in the CRM tabs and is the current page", async ({ page }) => {
    await page.goto("/crm/accounts")
    await expect(crmNav(page).getByRole("link")).toHaveText(["Dashboard", "Accounts", "Cases", "Contacts", "Triage", "Settings"])
    await expect(crmNav(page).getByRole("link", { name: "Accounts" })).toHaveAttribute("aria-current", "page")
  })

  test("without Stripe and the CRM database it is Not connected, never an error or a figure", async ({ page }) => {
    await page.goto("/crm/accounts")
    await expect(page.getByTestId("accounts-not-connected")).toBeVisible()
    for (const id of ["tile-organizations", "tile-users-attached", "tile-users-no-org"]) {
      await expect(page.getByTestId(id).getByTestId("not-connected")).toBeVisible()
    }
    await expect(page.getByTestId("org-row")).toHaveCount(0)
    await expect(page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })).toHaveCount(0)
  })

  test("the accounts API is behind the same gate as every /api route", async ({ request }) => {
    const res = await request.get("/api/crm/accounts")
    // The e2e server runs with the gate off: the route answers, Not connected, never a raw error.
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: "not_connected", orgs: [] })
  })

  test("connected with no organizations: the empty state", async ({ page }) => {
    await mockAccounts(page, EMPTY)
    await page.goto("/crm/accounts")
    await expect(page.getByTestId("accounts-empty")).toContainText("No organizations yet")
    await expect(page.getByTestId("tile-organizations")).toContainText("0")
  })

  test("orgs A to Z with users, three tiles, tabs filter, rows expand, and a search with no match offers Clear search", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockAccounts(page, LIVE)
    await page.goto("/crm/accounts")
    const table = page.getByRole("table", { name: "Organizations" })
    await expect(table.getByTestId("org-row")).toHaveCount(4)
    await expect(table.getByTestId("org-row")).toHaveText([/test org alpha/, /Test Org Bravo/, /Test Org Charlie/, /Test Org Delta/])
    await expect(table.getByRole("columnheader")).toHaveText(["", "Organization", "Users", "Plan", "MRR"])
    await expect(table.getByTestId("org-row").last()).toContainText("Canceled")

    await expect(page.getByTestId("tile-organizations")).toContainText("4")
    await expect(page.getByTestId("tile-users-attached")).toContainText("5")
    await expect(page.getByTestId("tile-users-no-org")).toContainText("1")
    await expect(page.getByRole("region", { name: "Accounts summary" }).getByTestId(/^tile-/)).toHaveCount(3)
    const screen = page.getByTestId("accounts-screen")
    await expect(screen.getByText(/seats?\b|Renews|Customer since|Started/i)).toHaveCount(0)
    await expect(page.getByRole("combobox", { name: "Sort organizations" })).toHaveCount(0)

    await expect(page.getByRole("tab")).toHaveCount(3)
    await page.getByRole("tab", { name: /Canceled/ }).click()
    await expect(table.getByTestId("org-row")).toHaveCount(1)
    await expect(table.getByTestId("org-row")).toContainText("Test Org Delta")
    await page.getByRole("tab", { name: /No organization/ }).click()
    await expect(page.getByRole("table", { name: "Users with no organization" })).toContainText("Test Loose User")
    await page.getByRole("tab", { name: /^All/ }).click()
    await expect(page.getByTestId("no-org-row")).toContainText("No organization")

    const toggle = page.getByRole("button", { name: "Show users of Test Org Bravo" })
    await toggle.click()
    await expect(page.getByRole("button", { name: "Hide users of Test Org Bravo" })).toHaveAttribute("aria-expanded", "true")
    const users = page.getByRole("table", { name: "Users of Test Org Bravo" })
    await expect(users).toContainText("Test Person t-bravo")
    await expect(users).toContainText("Test Person Two")

    await page.getByRole("searchbox", { name: "Search organizations or users" }).fill("zephyr academy")
    await expect(page.getByTestId("accounts-no-results")).toContainText("No organizations or users match “zephyr academy”")
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(table.getByTestId("org-row")).toHaveCount(4)
  })

  test("the organization page shows its users, read-only, with no seats or dates", async ({ page }) => {
    await mockAccounts(page, LIVE)
    await page.goto("/crm/accounts/t-bravo")
    await expect(page.getByRole("heading", { level: 1, name: "Test Org Bravo" })).toBeVisible()
    await expect(page.getByRole("table", { name: "Users of Test Org Bravo" })).toContainText("Test Person Two")
    await expect(page.getByTestId("add-seats")).toHaveCount(0)
    await expect(page.getByTestId("seats-hero")).toHaveCount(0)
    await expect(page.getByTestId("account-detail").getByText(/seats?\b|Renews|Customer since|Started/i)).toHaveCount(0)
  })

  for (const body of [
    { name: "not connected", data: null },
    { name: "live", data: LIVE },
  ] as const) {
    test(`phone 390 (${body.name}): stacked cards, 44px targets, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      if (body.data) await mockAccounts(page, body.data)
      await page.goto("/crm/accounts")
      if (body.data) {
        await expect(page.getByTestId("org-card")).toHaveCount(4)
        await expect(page.getByTestId("org-card").first()).toContainText("test org alpha")
        await expect(page.getByRole("table", { name: "Organizations" })).toBeHidden()
        await expectTapTarget(page.getByTestId("org-card").first().getByRole("button"), "org card")
        await expectTapTarget(page.getByRole("tab", { name: /^All/ }), "All tab")
        await expectTapTarget(page.getByRole("searchbox", { name: "Search organizations or users" }), "search")
        await page.getByTestId("org-card").first().getByRole("button").click()
        await expectTapTarget(page.getByRole("link", { name: /Open organization/ }).first(), "Open organization")
      } else {
        await expect(page.getByTestId("accounts-not-connected")).toBeVisible()
      }
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })
  }
})
