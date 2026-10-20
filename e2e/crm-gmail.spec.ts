import { expect, test, type Page } from "@playwright/test"

import { gmailConnecting } from "../src/lib/crm/gmail-summary"

import { expectReadable, settleAnimations } from "./support/contrast"
import {
  CRM_CONNECTING_LEDE,
  CRM_LEDE,
  CRM_LIVE_LEDE,
  CRM_STORAGE_KEY as STORAGE_KEY,
  EDITS_NOTE,
  FIND_CONTACT,
  GMAIL_CONNECT,
  GMAIL_READ_ONLY_NOTE,
  LIVE_CASES,
  LIVE_OPEN_TILE,
  LIVE_PEOPLE,
  LIVE_TRIAGE,
  OWN_CONTACTS,
  clearMenuItem,
  closeCrmMenu,
  crmHeader,
  crmMenu,
  crmMenuButton,
  crmSource,
  expectCrmSource,
  expectGmailPanel,
  gmailPanel,
  openCrmMenu,
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

const header = crmHeader
// Gmail's badge and Clear my entries are in the header's ⋯ menu (open it first).
const source = crmSource
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")
const clearButton = clearMenuItem
const connect = (page: Page) => crmMenu(page).getByRole("menuitem", { name: GMAIL_CONNECT, exact: true })

/** Gmail's badge in the open menu, contrast checked (the menu is closed again). */
async function expectSourceReadable(page: Page, label: string) {
  await openCrmMenu(page)
  await settleAnimations(page)
  await expectReadable(source(page), label, expect)
  await closeCrmMenu(page)
}

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
    // Hill's CrmListResponse (status, lastUpdated, zero counts, empty lists)
    // alongside the older lastSyncedAt / mailbox / data fields.
    expect(await res.json()).toEqual({
      status: "not_connected",
      lastSyncedAt: null,
      data: null,
      mailbox: "info@chlkapp.com",
      lastUpdated: null,
      counts: { open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 },
      cases: [],
      accounts: [],
      recentActivity: [],
    })
  })

  test("/api/crm/gmail?caseId= refuses a malformed id with 400, no Gmail call", async ({ request }) => {
    const res = await request.get("/api/crm/gmail?caseId=not-a-case")
    expect(res.status()).toBe(400)
    expect(res.headers()["cache-control"]).toBe("no-store")
    expect(await res.json()).toEqual({ error: "bad_case_id" })
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
      await openCrmMenu(page)
      await expect(source(page)).toHaveText("Gmail not connected")
      await expect(source(page)).toHaveAttribute("data-source", "not_connected")
      // Connect… goes to Settings › Connected data, only while not connected.
      await expect(connect(page)).toHaveAttribute("href", "/settings#connected-data")
      await closeCrmMenu(page)
      await expect(header(page).getByText(CRM_LEDE, { exact: true })).toBeVisible()
      await expectGmailPanel(page, screen)
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
      await expect(page.getByRole("main").getByRole("table")).toHaveCount(0)
      await expect(page.getByRole("main").getByTestId("case-list")).toHaveCount(0)
      await expect(page.getByRole("main").getByTestId("account-list")).toHaveCount(0)
      await expect(triageCards(page)).toHaveCount(0)
    }
    // Connect… opens Settings at Connected data.
    await openCrmMenu(page)
    await connect(page).click()
    await expect(page).toHaveURL(/\/settings#connected-data$/)
    await expect(page.getByRole("region", { name: "Connected data" })).toBeVisible()
    await open(page, "/crm")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectSourceReadable(page, `not connected badge (${theme})`)
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

  test("every screen shows skeletons and Connecting…, with no panel, saved-edits note or usable Clear", async ({ page }) => {
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
      await expect(header(page).locator("p").first()).toHaveText(CRM_CONNECTING_LEDE)
      if (skeleton) {
        await expect(page.getByRole("main").getByRole("status", { name: skeleton, exact: true })).toBeVisible()
      } else {
        const busy = page.getByRole("main").getByTestId("crm-connecting")
        await expect(busy.first()).toBeVisible()
        await expect(busy.first()).toHaveAttribute("aria-busy", "true")
      }
      await expect(gmailPanel(page)).toHaveCount(0)
      await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toHaveText("Triage")
      for (const own of OWN_CONTACTS) await expect(page.getByText(own.email)).toHaveCount(0)
      await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
      // The ⋯ menu: Connecting…, no Connect…, the saved edits still loading
      // (never "Saved in this browser") and Clear my entries off.
      await openCrmMenu(page)
      await expect(source(page)).toHaveText("Connecting…")
      await expect(source(page)).toHaveAttribute("data-source", "connecting")
      await expect(source(page)).toHaveAttribute("aria-busy", "true")
      await expect(connect(page)).toHaveCount(0)
      await expect(persistenceNote(page)).toHaveText("Loading saved edits…")
      await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
      await closeCrmMenu(page)
    }
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectSourceReadable(page, `connecting badge (${theme})`)
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
    await expect(header(page).getByText(CRM_LIVE_LEDE, { exact: true })).toBeVisible()
    await openCrmMenu(page)
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(source(page)).toHaveAttribute("data-source", "gmail")
    await expect(connect(page)).toHaveCount(0)
    // Overview, Cases and Accounts keep their own edits in this browser; the
    // menu's read-only line is for Contacts and Triage. Nothing saved yet: Clear is off.
    await expect(crmMenu(page).getByTestId("crm-read-only")).toHaveCount(0)
    await expect(persistenceNote(page)).toHaveText(EDITS_NOTE)
    await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
    await closeCrmMenu(page)
    await expect(page.getByRole("main").getByRole("link", { name: LIVE_OPEN_TILE, exact: true })).toBeVisible()
    await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(gmailPanel(page)).toHaveCount(0)
    await expect(crmNav(page).getByRole("link", { name: /Triage/ })).toContainText("2")
    expect(calls()).toBeGreaterThan(0)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    const table = page.getByRole("table", { name: "Cases" })
    await expect(table.getByText(LIVE_CASES.roster)).toBeVisible()
    await expect(table.getByText(LIVE_CASES.refund)).toBeVisible()
    await expect(table.getByTestId("sample-data-tag")).toHaveCount(0)
    // The count line and the always-visible edits note sit under the filter bar.
    await expect(page.getByRole("main").getByTestId("crm-cases-count")).toHaveText(/^\d+ cases$/)
    await expect(page.getByRole("main").getByTestId("crm-edits-note")).toHaveText(EDITS_NOTE)
    // A case opens in the panel beside the list (1440), its thread read through ?caseId=.
    await table.getByRole("link", { name: /Roster import fails/ }).click()
    const panel = page.getByTestId("case-panel")
    await expect(panel).toHaveAttribute("data-mode", "split")
    await expect(panel.getByRole("heading", { level: 2, name: /Roster import fails/ })).toBeVisible()
    // Thread bodies are plain text.
    await expect(
      panel.getByTestId("message-text").filter({ hasText: "Attached. Same thing happens on the iPad app & the web." })
    ).toBeVisible()
    await expect(panel.getByTestId("message-html")).toHaveCount(0)
    await expect(panel.getByRole("radiogroup", { name: "Status" }).getByRole("radio")).toHaveCount(4)

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await openCrmMenu(page)
    await expect(crmMenu(page).getByTestId("crm-read-only")).toHaveText(GMAIL_READ_ONLY_NOTE)
    await closeCrmMenu(page)
    await expect(page.getByRole("table", { name: "Contacts" }).getByText(LIVE_PEOPLE.dana.name)).toBeVisible()
    await expect(page.getByText(/you added/)).toHaveCount(0)
    for (const person of OWN_CONTACTS) await expect(page.getByText(person.email)).toHaveCount(0)

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(triageCards(page)).toHaveCount(2)
    await expect(page.getByText(LIVE_TRIAGE.sam)).toBeVisible()

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(own)
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectSourceReadable(page, `live badge (${theme})`)
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
    await openCrmMenu(page)
    await expect(source(page)).toHaveText(/^Last updated /)
    await expect(source(page)).toHaveAttribute("data-source", "gmail")
    await expect(source(page)).toHaveAttribute("data-stale", "")
    await closeCrmMenu(page)
    await expect(page.getByRole("main").getByRole("link", { name: LIVE_OPEN_TILE, exact: true })).toBeVisible()
    await expect(gmailPanel(page)).toHaveCount(0)
    await expectSourceReadable(page, "stale badge")
  })

  test("our own endpoint failing with no copy yet reads as not connected, never an error", async ({ page }) => {
    await page.route(GMAIL_ROUTE, (route) => route.fulfill({ status: 500, body: "boom" }))
    await open(page, "/crm")
    await expectCrmSource(page, "Gmail not connected", "not_connected")
    await expectGmailPanel(page, "overview")
    await expect(page.getByText(/open conversations/)).toHaveCount(0)
    await expect(page.getByText("boom")).toHaveCount(0)
  })
})

test.describe("Gmail connected at phone width (390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the header fits (title, ⋯, full-width Find a contact…); the badge's menu fits the screen; no sideways scroll", async ({
    page,
  }) => {
    await mockGmail(page, liveGmailSummary(Date.now()))
    await open(page, "/crm")
    await expect(header(page).getByText(CRM_LIVE_LEDE, { exact: true })).toBeVisible()
    await expect(crmMenuButton(page)).toBeInViewport({ ratio: 1 })
    await expect(header(page).getByRole("button", { name: FIND_CONTACT, exact: true })).toBeInViewport({ ratio: 1 })
    const menu = await openCrmMenu(page)
    await settleAnimations(page)
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(menu).toBeInViewport({ ratio: 1 })
    await closeCrmMenu(page)
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(0)
  })
})
