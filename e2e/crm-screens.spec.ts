import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import {
  CRM_STORAGE_KEY as STORAGE_KEY,
  LIVE_CASES,
  LIVE_TRIAGE,
  expectGmailPanel,
  gmailPanel,
} from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { CLEAR_CONFIRM_NAME, NOTE, clearMyEntries, persistenceNote } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for the CRM page, every main state in both themes at
 * desktop width: Gmail not connected (the panels, and a contact the
 * founder adds) and Gmail connected (the fixture inbox from a mocked
 * /api/crm/gmail). The walk and its assertions run in every e2e run; the
 * PNGs are written only with SCREENSHOTS=1 (`pnpm screens:crm`). Output
 * goes to docs/screenshots/crm and, when SCREENSHOT_DIR is set, there as
 * well.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/crm"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const source = (page: Page) => header(page).getByTestId("crm-source")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const triageCards = (page: Page) => page.locator("[data-slot=triage-card]")

for (const theme of ["light", "dark"] as const) {
  test(`captures every CRM state (${theme})`, async ({ page }) => {
    // Gmail not connected: the panels, then a contact of the founder's own.
    await page.goto("/crm")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(source(page)).toHaveText("Gmail not connected")
    await expectGmailPanel(page, "overview")
    await shoot(page, `crm-overview-not-connected-${theme}`)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expectGmailPanel(page, "cases")
    await shoot(page, `crm-cases-not-connected-${theme}`)

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expectGmailPanel(page, "triage")
    await shoot(page, `crm-triage-not-connected-${theme}`)

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expectGmailPanel(page, "contacts")
    await expect(page.getByRole("status", { name: "No contacts" })).toBeVisible()
    await shoot(page, `crm-contacts-empty-${theme}`)

    await page.getByRole("button", { name: "New contact", exact: true }).click()
    const add = dialog(page, "New contact")
    await expect(add).toBeVisible()
    await add.getByLabel("Email").fill("pat@example.org")
    await add.getByLabel("First name").fill("Pat")
    await add.getByLabel("Last name").fill("Reyes")
    await add.getByLabel("Organization").fill("Katy ISD")
    await shoot(page, `crm-contact-dialog-${theme}`)
    await add.getByRole("button", { name: "Create contact", exact: true }).click()
    await expect(add).toBeHidden()
    await expect(page.getByRole("table", { name: "Contacts" }).getByRole("row", { name: /Pat Reyes/ })).toBeVisible()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await shoot(page, `crm-contacts-own-${theme}`)

    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expect(page.getByRole("link", { name: "1 contact you added", exact: true })).toBeVisible()
    await shoot(page, `crm-overview-own-${theme}`)

    await header(page).getByRole("button", { name: "Clear my entries", exact: true }).click()
    await expect(dialog(page, CLEAR_CONFIRM_NAME)).toBeVisible()
    await shoot(page, `crm-clear-confirm-${theme}`)
    await dialog(page, CLEAR_CONFIRM_NAME).getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(dialog(page, CLEAR_CONFIRM_NAME)).toBeHidden()
    await clearMyEntries(page, header(page))
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(page.getByRole("link", { name: /you added/ })).toHaveCount(0)

    // Gmail connected: the fixture inbox, read-only.
    await mockGmail(page, liveGmailSummary(Date.now()))
    await page.goto("/crm")
    await expect(source(page)).toHaveText("Live from Gmail")
    await expect(page.getByText("3 contacts · 3 open conversations")).toBeVisible()
    await expect(gmailPanel(page)).toHaveCount(0)
    await shoot(page, `crm-overview-${theme}`)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("table", { name: "Cases" })).toBeVisible()
    await shoot(page, `crm-cases-list-${theme}`)

    await page.getByRole("link", { name: new RegExp(LIVE_CASES.roster) }).click()
    await expect(page.getByRole("heading", { level: 2, name: LIVE_CASES.roster })).toBeVisible()
    await shoot(page, `crm-case-detail-${theme}`)

    await page.getByRole("button", { name: "Waiting on customer" }).click()
    await page.getByLabel("Internal note").fill("Asked Dana for the CSV.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Asked Dana for the CSV.")).toBeVisible()
    await shoot(page, `crm-case-note-added-${theme}`)

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible()
    await shoot(page, `crm-contacts-list-${theme}`)

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(page.getByText(LIVE_TRIAGE.sam)).toBeVisible()
    await shoot(page, `crm-triage-${theme}`)

    await triageCards(page).filter({ hasText: LIVE_TRIAGE.sam }).getByRole("button", { name: "Promote to case" }).click()
    const jordan = triageCards(page).filter({ hasText: LIVE_TRIAGE.jordan })
    await jordan.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: "Ignore this thread" }).click()
    await expect(page.getByRole("status", { name: "Triage is clear" })).toBeVisible()
    await shoot(page, `crm-triage-empty-${theme}`)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
    for (let i = 0; i < 8; i++) {
      const table = page.getByRole("table", { name: "Cases" })
      if (!(await table.isVisible())) break
      const subject = table.locator("tbody tr").first().locator("td").nth(1).getByRole("link")
      await subject.click()
      await page.getByRole("button", { name: /Delete case/ }).click()
      await dialog(page, "Delete this case?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(page.getByRole("status", { name: "Case not found" })).toBeVisible()
      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
      await expect(page.getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
    }
    await expect(page.getByRole("status", { name: "No cases" })).toBeVisible()
    await shoot(page, `crm-empty-${theme}`)
  })
}
