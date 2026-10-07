import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { addDays, now, todayIn } from "../src/lib/clock"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"

/**
 * Review screenshots for the Sales Opportunities page, every main state in
 * both themes at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:sales`). Output goes to docs/screenshots/sales-opportunities
 * and, when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/sales-opportunities"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.sales-opportunities.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

// Role lookups are scoped by name, directly or through a named ancestor.
const rail = (page: Page) => page.locator('[data-slot="sidebar"]').first()
const screen = (page: Page) => page.getByRole("region", { name: "Sales Opportunities", exact: true })
const deals = (page: Page) => screen(page).getByRole("region", { name: "Deals", exact: true })
const table = (page: Page) => deals(page).getByRole("table", { name: "Deals", exact: true })
const rows = (page: Page) => table(page).locator("tbody").getByRole("row")
const row = (page: Page, who: RegExp) => table(page).getByRole("row", { name: who })
const note = (page: Page, opts?: { failed?: boolean }) => persistenceNote(page, opts)
const filter = (page: Page, name: string) =>
  deals(page).getByRole("group", { name: "Show deals" }).getByRole("button", { name, exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function setTheme(page: Page, theme: "light" | "dark") {
  // Through the real provider: click the sidebar toggle, not a query param.
  await rail(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

async function fresh(page: Page) {
  await page.goto("/sales-opportunities")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(note(page)).toHaveText(NOTE.unsaved)
  await expect(rows(page)).toHaveCount(6)
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every Sales Opportunities state (${theme})`, async ({ page }) => {
    await fresh(page)
    await setTheme(page, theme)

    // Default: Open deals, sorted by next step, overdue flagged.
    await shoot(page, `sales-opportunities-default-${theme}`)

    // Filtered to Won.
    await filter(page, "Won").click()
    await expect(rows(page)).toHaveCount(1)
    await shoot(page, `sales-opportunities-filter-won-${theme}`)
    await filter(page, "Open").click()

    // Add dialog, filled in.
    await deals(page).getByRole("button", { name: "Add deal", exact: true }).click()
    const add = dialog(page, "Add deal")
    await add.getByRole("textbox", { name: "Who" }).fill("Coach Jordan Reyes")
    await add.getByRole("textbox", { name: "School / org" }).fill("Westlake HS")
    await add.getByRole("textbox", { name: "What they're buying" }).fill("Staff seats × 6")
    await add.getByRole("textbox", { name: "Value" }).fill("1800")
    await add.getByRole("textbox", { name: "Next step" }).fill("Send the quote")
    await add.getByLabel("Due date").fill(addDays(todayIn(now()), 3))
    await shoot(page, `sales-opportunities-add-dialog-${theme}`)
    await add.getByRole("button", { name: "Add deal", exact: true }).click()
    await expect(add).toBeHidden()
    await expect(row(page, /Jordan Reyes/)).toBeVisible()

    // Edit dialog on a seed row.
    await row(page, /Treadwell/).getByRole("button", { name: "Edit Coach Marcus Treadwell" }).click()
    const edit = dialog(page, "Edit deal")
    await expect(edit.getByRole("textbox", { name: "Who" })).toHaveValue("Coach Marcus Treadwell")
    await shoot(page, `sales-opportunities-edit-dialog-${theme}`)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()

    // Reset confirm (enabled now that something is saved).
    await expect(note(page)).toHaveText(NOTE.saved)
    await screen(page).getByRole("button", { name: "Reset", exact: true }).click()
    await expect(dialog(page, "Reset demo data?")).toBeVisible()
    await shoot(page, `sales-opportunities-reset-confirm-${theme}`)
    await dialog(page, "Reset demo data?").getByRole("button", { name: "Keep my edits" }).click()
    await expect(dialog(page, "Reset demo data?")).toBeHidden()

    // Empty: delete every deal.
    await filter(page, "All").click()
    await expect(rows(page)).toHaveCount(9)
    for (const who of ["Pruitt", "Okafor", "Castellano", "Whitaker", "Treadwell", "Alvarez", "Hale", "Fitch", "Jordan Reyes"]) {
      await row(page, new RegExp(who)).getByRole("button", { name: /^Delete / }).click()
      await dialog(page, "Delete this deal?").getByRole("button", { name: "Delete", exact: true }).click()
    }
    await expect(deals(page).getByRole("status", { name: "No deals" })).toContainText("No live deals")
    await shoot(page, `sales-opportunities-empty-${theme}`)

    // Back to the seed for the next run (the filter is still on All).
    await resetDemoData(page, screen(page))
    await expect(rows(page)).toHaveCount(8)
  })

  test(`captures the save-failed state (${theme})`, async ({ page }) => {
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === key) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
        return original.call(this, k, v)
      }
    }, STORAGE_KEY)
    await fresh(page)
    await setTheme(page, theme)
    await row(page, /Pruitt/).getByRole("button", { name: "Stage: Verbal" }).click()
    await page.getByRole("menu").getByRole("menuitemradio", { name: "Proposal" }).click()
    await expect(note(page, { failed: true })).toHaveText(NOTE.failed)
    await shoot(page, `sales-opportunities-save-failed-${theme}`)
  })
}
