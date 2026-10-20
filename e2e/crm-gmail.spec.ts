import { expect, test, type Page } from "@playwright/test"

import { gmailConnecting } from "../src/lib/crm/gmail-summary"

import { expectReadable } from "./support/contrast"
import {
  CRM_CONNECTING_LEDE,
  CRM_LEDE,
  CRM_STORAGE_KEY as STORAGE_KEY,
  LIVE_CASES,
  LIVE_OPEN_TILE,
  LIVE_PEOPLE,
  LIVE_TRIAGE,
  OWN_CONTACTS,
  expectGmailPanel,
  gmailPanel,
  ownCrmState,
  type CrmScreen,
} from "./support/crm"
import { GMAIL_ROUTE, liveGmailSummary, mockGmail } from "./support/gmail"
import { persistenceNote } from "./support/persistence"
import { pageOverflowX, waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * The CRM's Gmail source, four states. e2e never has Gmail credentials:
 * "not connected" is the real server with none; "connecting", "connected"
 * and "stale" mock /api/crm/gmail in the browser ("connected" and "stale"
 * with the fixture inbox). Nothing here reaches Google.
 */

const header = (page: Page) => page.getByRole("main").locator("header").first()
const source = (page: Page) => header(page).getByTestId("crm-source")
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })

const SCREENS: Array<[string, CrmScreen]> = [
  ["/crm", "overview"],
  ["/crm/cases", "cases"],
  ["/crm/accounts", "accounts"],
  ["/crm/contacts", "contacts"],
  ["/crm/triage", "triage"],
]

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

  test("every screen says Gmail is not connected and shows its panel, never sample rows", async ({ page }) => {
    for (const [path, screen] of SCREENS) {
      await open(page, path)
      await expect(source(page)).toHaveText("Gmail not connected")
      await expect(source(page)).toHaveAttribute("data-source", "not_connected")
      await expect(header(page).getByText(CRM_LEDE, { exact: true })).toBeVisible()
      await expectGmailPanel(page, screen)
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
      await expect(page.getByRole("main").getByRole("table")).toHaveCount(0)
      await expect(triageCards(page)).toHaveCount(0)
    }
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

test.describe("Gmail connecting (mocked first sync)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("every screen shows skeletons and Connecting…, with no panel, saved-edits note or Clear", async ({ page }) => {
    // Even with the founder's own contacts saved: the rows wait for the first sync.
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify(ownCrmState())] as const
    )
    await mockGmail(page, gmailConnecting())
    // Overview has no skeleton status of its own: its tiles show busy Connecting… badges.
    for (const [path, skeleton] of [
      ["/crm", null],
      ["/crm/cases", "Loading cases"],
      ["/crm/accounts", "Loading accounts"],
      ["/crm/contacts", "Loading saved contacts"],
      ["/crm/triage", "Loading saved triage"],
    ] as const) {
      await open(page, path)
      await expect(source(page)).toHaveText("Connecting…")
      await expect(source(page)).toHaveAttribute("data-source", "connecting")
      await expect(header(page).locator("p").first()).toHaveText(CRM_CONNECTING_LEDE)
      if (skeleton) {
        await expect(page.getByRole("main").getByRole("status", { name: skeleton, exact: true })).toBeVisible()
      } else {
        const busy = page.getByRole("main").getByTestId("crm-connecting")
        await expect(busy.first()).toBeVisible()
        await expect(busy.first()).toHaveAttribute("aria-busy", "true")
      }
      await expect(persistenceNote(page)).toHaveCount(0)
      await expect(clearButton(page)).toHaveCount(0)
      await expect(gmailPanel(page)).toHaveCount(0)
      await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toHaveText("Triage")
      for (const own of OWN_CONTACTS) await expect(page.getByText(own.email)).toHaveCount(0)
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
    }
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectReadable(source(page), `connecting badge (${theme})`, expect)
    }
  })
})

test.describe("Gmail connected (mocked)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("Overview, Cases, a case, Contacts and Triage come from the inbox, with no sample labels", async ({ page }) => {
    // The founder's own contacts, saved while Gmail was not connected, are
    // left alone (and not shown) while Gmail is live.
    const own = JSON.stringify(ownCrmState())
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, own] as const)
    const calls = await mockGmail(page, liveGmailSummary(Date.now()))
    await open(page, "/crm")
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(header(page).getByText("Conversations, contacts, and triage from info@chlkapp.com")).toBeVisible()
    // Overview, Cases and Accounts keep their own edits note; the header's read-only note is for Contacts and Triage.
    await expect(header(page).getByTestId("crm-read-only")).toHaveCount(0)
    await expect(page.getByRole("main").getByRole("link", { name: LIVE_OPEN_TILE, exact: true })).toBeVisible()
    await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(gmailPanel(page)).toHaveCount(0)
    await expect(clearButton(page)).toHaveCount(0)
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toContainText("2")
    expect(calls()).toBeGreaterThan(0)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    const table = page.getByRole("table", { name: "Cases" })
    await expect(table.getByText(LIVE_CASES.roster)).toBeVisible()
    await expect(table.getByText(LIVE_CASES.refund)).toBeVisible()
    await expect(table.getByTestId("sample-data-tag")).toHaveCount(0)
    // A case opens in the panel beside the list (1440), its thread read through ?caseId=.
    await table.getByRole("link", { name: /Roster import fails/ }).click()
    const panel = page.getByTestId("case-panel")
    await expect(panel.getByRole("heading", { level: 2, name: /Roster import fails/ })).toBeVisible()
    await expect(panel.getByText("Attached. Same thing happens on the iPad app & the web.")).toBeVisible()

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(header(page).getByTestId("crm-read-only")).toHaveText("Read-only · edits here aren't saved")
    await expect(page.getByRole("table", { name: "Contacts" }).getByText(LIVE_PEOPLE.dana.name)).toBeVisible()
    await expect(page.getByText(/you added/)).toHaveCount(0)
    for (const person of OWN_CONTACTS) await expect(page.getByText(person.email)).toHaveCount(0)

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(triageCards(page)).toHaveCount(2)
    await expect(page.getByText(LIVE_TRIAGE.sam)).toBeVisible()

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(own)
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
    await expect(page.getByRole("main").getByRole("link", { name: LIVE_OPEN_TILE, exact: true })).toBeVisible()
    await expect(gmailPanel(page)).toHaveCount(0)
    await expectReadable(source(page), "stale badge", expect)
  })

  test("our own endpoint failing with no copy yet reads as not connected, never an error", async ({ page }) => {
    await page.route(GMAIL_ROUTE, (route) => route.fulfill({ status: 500, body: "boom" }))
    await open(page, "/crm")
    await expect(source(page)).toHaveText("Gmail not connected")
    await expectGmailPanel(page, "overview")
    await expect(page.getByText(/open conversations/)).toHaveCount(0)
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
