import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for the CRM page, every main state in both themes
 * at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:crm`). Output goes to docs/screenshots/crm and,
 * when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/crm"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.crm.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })

for (const theme of ["light", "dark"] as const) {
  test(`captures every CRM state (${theme})`, async ({ page }) => {
    await page.goto("/crm")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(page.getByText(/6 contacts/)).toBeVisible()

    await shoot(page, `crm-overview-${theme}`)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("table", { name: "Cases" })).toBeVisible()
    await shoot(page, `crm-cases-list-${theme}`)

    await page.getByRole("link", { name: /Can't invite teammates to workspace/ }).click()
    await expect(page.getByRole("heading", { level: 2, name: /Can't invite teammates/ })).toBeVisible()
    await shoot(page, `crm-case-detail-${theme}`)

    await page.getByRole("button", { name: "Waiting on customer" }).click()
    await page.getByLabel("Internal note").fill("Called Dana, waiting on a screenshot.")
    await page.getByRole("button", { name: "Add note", exact: true }).click()
    await expect(page.getByText("Called Dana, waiting on a screenshot.")).toBeVisible()
    await shoot(page, `crm-case-note-added-${theme}`)

    await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
    await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible()
    await shoot(page, `crm-contacts-list-${theme}`)

    await page.getByRole("button", { name: "New contact", exact: true }).click()
    const add = dialog(page, "New contact")
    await expect(add).toBeVisible()
    await add.getByLabel("Email").fill("pat@katyisd.org")
    await add.getByLabel("First name").fill("Pat")
    await shoot(page, `crm-contact-dialog-${theme}`)
    await page.keyboard.press("Escape")
    await expect(add).toBeHidden()

    await crmNav(page).getByRole("link", { name: /Triage/ }).click()
    await expect(page.getByText("Lena Ortiz")).toBeVisible()
    await shoot(page, `crm-triage-${theme}`)

    await header(page).getByRole("button", { name: "Reset", exact: true }).click()
    await expect(dialog(page, "Reset demo data?")).toBeVisible()
    await shoot(page, `crm-reset-confirm-${theme}`)
    await dialog(page, "Reset demo data?").getByRole("button", { name: "Keep my edits", exact: true }).click()

    await page.locator("[data-slot=triage-card]", { hasText: "Lena Ortiz" }).getByRole("button", { name: "Promote to case" }).click()
    const alex = page.locator("[data-slot=triage-card]", { hasText: "Alex Kim" })
    await alex.getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: "Ignore this thread" }).click()
    await expect(page.getByRole("status", { name: "Triage is clear" })).toBeVisible()
    await shoot(page, `crm-triage-empty-${theme}`)

    await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
    await expect(page.getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
    for (let i = 0; i < 16; i++) {
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

    await resetDemoData(page, header(page))
    await crmNav(page).getByRole("link", { name: "Overview", exact: true }).click()
    await expect(page.getByText(/6 contacts/)).toBeVisible()
  })
}
