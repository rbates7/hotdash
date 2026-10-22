import { expect, test, type Page } from "@playwright/test"

const CRM_SECTIONS = ["Dashboard", "Cases", "Contacts", "Triage", "Settings"]

const crmNav = (page: Page) =>
  page.getByRole("navigation", { name: "CRM", exact: true })
const dataError = (page: Page) =>
  page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })

async function expectCopiedNavigation(page: Page) {
  const nav = crmNav(page)
  await expect(nav.getByRole("link")).toHaveText(CRM_SECTIONS)
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "/crm"
  )
  await expect(nav.getByRole("link", { name: "Cases" })).toHaveAttribute(
    "href",
    "/crm/cases"
  )
  await expect(nav.getByRole("link", { name: "Contacts" })).toHaveAttribute(
    "href",
    "/crm/contacts"
  )
  await expect(nav.getByRole("link", { name: "Triage" })).toHaveAttribute(
    "href",
    "/crm/triage"
  )
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "href",
    "/crm/settings"
  )
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Accounts" })).toHaveCount(0)
}

test.describe("copied production CRM", () => {
  test("keeps the dashboard shell and replaces only the CRM navigation", async ({
    page,
  }) => {
    await page.goto("/crm")

    await expectCopiedNavigation(page)
    const dashboardNav = page.getByRole("navigation", {
      name: "Founder dashboard",
      exact: true,
    })
    await expect(
      dashboardNav.getByRole("link", { name: "CRM", exact: true })
    ).toHaveAttribute("data-active")
  })

  test("keeps every copied CRM section reachable while data is unavailable", async ({
    page,
  }) => {
    for (const [path, current] of [
      ["/crm", "Dashboard"],
      ["/crm/cases", "Cases"],
      ["/crm/contacts", "Contacts"],
      ["/crm/triage", "Triage"],
      ["/crm/settings", "Settings"],
    ] as const) {
      await page.goto(path)
      await expectCopiedNavigation(page)
      await expect(
        crmNav(page).getByRole("link", { name: current })
      ).toHaveAttribute("aria-current", "page")
      await expect(dataError(page)).toContainText("CRM couldn’t load")
      await expect(dataError(page)).toContainText(
        "saved cases and notes are not changed"
      )
    }
  })

  test("retires Accounts by redirecting its old URL to Contacts", async ({
    page,
  }) => {
    await page.goto("/crm/accounts")
    await expect(page).toHaveURL(/\/crm\/contacts$/)
    await expect(
      crmNav(page).getByRole("link", { name: "Contacts" })
    ).toHaveAttribute("aria-current", "page")
    await expect(crmNav(page).getByRole("link", { name: "Accounts" })).toHaveCount(
      0
    )
  })

  test("cron sync fails closed without its server secret", async ({
    request,
  }) => {
    const response = await request.get("/api/crm/sync/gmail")
    expect(response.status()).toBe(503)
    expect(await response.json()).toEqual({
      error: "CRON_SECRET is not configured.",
    })
  })

  test("manual sync rejects cross-site writes before touching data", async ({
    request,
  }) => {
    const response = await request.post("/api/crm/sync/gmail", {
      headers: { origin: "https://attacker.example" },
    })
    expect(response.status()).toBe(403)
  })
})
