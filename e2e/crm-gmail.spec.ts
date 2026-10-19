import { expect, test, type Page } from "@playwright/test"

import { expectReadable } from "./support/contrast"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * The CRM's Gmail source, three states. e2e never has Gmail credentials:
 * "not connected" is the real server with none; "connected" and "stale"
 * mock /api/crm/gmail in the browser with the fixture inbox. Nothing here
 * reaches Google.
 */

const STORAGE_KEY = "hotdash.crm.v1"
const header = (page: Page) => page.getByRole("main").locator("header").first()
const source = (page: Page) => header(page).getByTestId("crm-source")
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")

async function open(page: Page, path: string) {
  await page.goto(path)
  await waitForHydration(page)
}

test.describe("server endpoints with no Gmail credentials", () => {
  test("/api/crm/gmail is not_connected — no rows, no error text", async ({ request }) => {
    const res = await request.get("/api/crm/gmail")
    expect(res.status()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({ status: "not_connected", lastSyncedAt: null, data: null, mailbox: "info@chlkapp.com" })
  })

  test("/api/health/gmail says only not_configured", async ({ request }) => {
    const res = await request.get("/api/health/gmail")
    expect(res.status()).toBe(200)
    expect(await res.text()).toBe('{"gmail":"not_configured"}')
  })
})

test.describe("Gmail not connected (1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("the CRM shows its sample, labelled, and says Gmail is not connected", async ({ page }) => {
    await open(page, "/crm")
    await expect(source(page)).toHaveText("Gmail not connected")
    await expect(source(page)).toHaveAttribute("data-source", "sample")
    await expect(header(page).getByTestId("sample-data-tag")).toBeVisible()
    await expect(page.getByText(/6 contacts/)).toBeVisible()
    await expect(page.getByRole("main").getByTestId("sample-data-tag").nth(1)).toBeVisible()
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(source(page), `not connected badge (${theme})`, expect)
    }
  })

  test("Settings › Connected data: Gmail is Not connected", async ({ page }) => {
    await open(page, "/settings")
    const row = page.getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "Gmail" })
    await expect(row).toContainText("Not connected")
  })
})

test.describe("Gmail connected (mocked)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Overview, Cases, a case, Contacts and Triage come from the inbox, with no sample labels", async ({ page }) => {
    // The sample's saved copy is left alone while Gmail is live.
    await page.addInitScript((key) => localStorage.setItem(key, "{}"), STORAGE_KEY)
    const calls = await mockGmail(page, liveGmailSummary(Date.now()))
    await open(page, "/crm")
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(header(page).getByText("Conversations, contacts, and triage from info@chlkapp.com")).toBeVisible()
    await expect(header(page).getByTestId("crm-read-only")).toHaveText("Read-only · edits here aren't saved")
    await expect(page.getByText("3 contacts · 3 open conversations")).toBeVisible()
    await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toContainText("2")
    expect(calls()).toBeGreaterThan(0)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    const table = page.getByRole("table", { name: "Cases" })
    await expect(table.getByText("Roster import fails on a CSV with accents")).toBeVisible()
    await expect(table.getByText("Refund for a duplicate charge")).toBeVisible()
    await table.getByRole("link", { name: /Roster import fails/ }).click()
    await expect(page.getByRole("heading", { level: 2, name: /Roster import fails/ })).toBeVisible()
    await expect(page.getByText("Attached. Same thing happens on the iPad app & the web.")).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("table", { name: "Contacts" }).getByText("Dana Ortiz")).toBeVisible()

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(triageCards(page)).toHaveCount(2)
    await expect(page.getByText("Sam Patel")).toBeVisible()

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("{}")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(source(page), `live badge (${theme})`, expect)
    }
  })

  test("Settings › Connected data: Gmail is Connected", async ({ page }) => {
    await mockGmail(page, liveGmailSummary(Date.now()))
    await open(page, "/settings")
    const row = page.getByRole("region", { name: "Connected data" }).getByRole("listitem", { name: "Gmail" })
    await expect(row.getByTestId("gmail-status")).toHaveText("Connected")
    await expect(row.getByTestId("gmail-detail")).toContainText("info@chlkapp.com, read-only · last synced")
  })

  test("stale: the last threads, with when they were last updated", async ({ page }) => {
    await mockGmail(page, liveGmailSummary(Date.now(), "stale"))
    await open(page, "/crm")
    await expect(source(page)).toHaveText(/^Last updated /)
    await expect(page.getByText(/3 contacts/)).toBeVisible()
    await expectReadable(source(page), "stale badge", expect)
  })

  test("our own endpoint failing with no copy yet reads as not connected, never an error", async ({ page }) => {
    await page.route("**/api/crm/gmail", (route) => route.fulfill({ status: 500, body: "boom" }))
    await open(page, "/crm")
    await expect(source(page)).toHaveText("Gmail not connected")
    await expect(page.getByText(/6 contacts/)).toBeVisible()
    await expect(page.getByText("boom")).toHaveCount(0)
  })
})

test.describe("Gmail connected at phone width (390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the badge fits the header, with no sideways scroll", async ({ page }) => {
    await mockGmail(page, liveGmailSummary(Date.now()))
    await open(page, "/crm")
    await expect(source(page)).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })
})
