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
const DAY = 86_400_000
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString()

function user(id: string, name: string, org: string | null) {
  return { id, name, email: `${id}@test.invalid`, organization: org, startedAt: at(-300), plan: "Monthly", planStatus: "active" }
}

function org(id: string, name: string, o: Record<string, unknown> = {}) {
  return {
    id,
    name,
    domain: `${id}.invalid`,
    stripeCustomerId: "cus_TEST",
    subscriptionId: "sub_TEST",
    status: "active",
    canceled: false,
    plan: "Monthly",
    interval: "month",
    seatsUsed: 1,
    seatsTotal: 3,
    seatMonthlyCents: 1500,
    customerSince: at(-400),
    renewsAt: at(120),
    renewalKind: "renews",
    termMonths: 12,
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
  orgs: [
    org("t-alpha", "Test Org Alpha", { renewsAt: at(10) }),
    org("t-bravo", "Test Org Bravo", { seatsUsed: 3, seatsTotal: 3 }),
    org("t-charlie", "Test Org Charlie", { seatsUsed: 4, seatsTotal: 3 }),
    org("t-delta", "Test Org Delta", { canceled: true, status: "canceled", renewsAt: at(-20), renewalKind: "ended", mrrCents: 0 }),
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
    await expect(page.getByTestId("tile-total-seats").getByTestId("not-connected")).toBeVisible()
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

  test("tabs filter, rows expand, and a search with no match offers Clear search", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockAccounts(page, LIVE)
    await page.goto("/crm/accounts")
    const table = page.getByRole("table", { name: "Organizations" })
    await expect(table.getByTestId("org-row")).toHaveCount(4)
    // Renewal (soonest) by default; canceled last.
    await expect(table.getByTestId("org-row").first()).toContainText("Test Org Alpha")
    await expect(table.getByTestId("org-row").first().getByTestId("renewal-tag")).toHaveText("in 10 days")
    await expect(table.getByTestId("org-row").last()).toContainText("Lapsed")

    await page.getByRole("tab", { name: /Over limit/ }).click()
    await expect(table.getByTestId("org-row")).toHaveCount(1)
    await expect(table.getByTestId("org-row")).toContainText("+1 over")
    await page.getByRole("tab", { name: /Full/ }).click()
    await expect(table.getByTestId("org-row")).toContainText("Test Org Bravo")
    await page.getByRole("tab", { name: /No organization/ }).click()
    await expect(page.getByRole("table", { name: "Users with no organization" })).toContainText("Test Loose User")
    await page.getByRole("tab", { name: /^All/ }).click()

    const toggle = page.getByRole("button", { name: "Show users of Test Org Alpha" })
    await toggle.click()
    await expect(page.getByRole("button", { name: "Hide users of Test Org Alpha" })).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByRole("table", { name: "Users of Test Org Alpha" })).toContainText("Test Person t-alpha")

    await page.getByRole("searchbox", { name: "Search organizations or users" }).fill("zephyr academy")
    await expect(page.getByTestId("accounts-no-results")).toContainText("No organizations or users match “zephyr academy”")
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(table.getByTestId("org-row")).toHaveCount(4)
  })

  test("the organization page links Add seats to Stripe in a new tab", async ({ page }) => {
    await mockAccounts(page, LIVE)
    await page.goto("/crm/accounts/t-bravo")
    await expect(page.getByRole("heading", { level: 1, name: "Test Org Bravo" })).toBeVisible()
    const add = page.getByTestId("add-seats")
    await expect(add).toHaveAttribute("href", "https://dashboard.stripe.com/subscriptions/sub_TEST")
    await expect(add).toHaveAttribute("target", "_blank")
    await expect(page.getByTestId("seats-hero")).toContainText("Full")
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
