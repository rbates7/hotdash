import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { addDays, now, todayIn } from "../src/lib/clock"
import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"

/**
 * Review screenshots for the Clinics page, every main state in both themes
 * at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:clinics`). Output goes to docs/screenshots/clinics and,
 * when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/clinics"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.clinics.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  // Dialogs and menus fade in; shoot at rest rather than after a fixed wait.
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

// Role lookups are scoped by name, directly or through a named ancestor.
const themeSwitch = (page: Page) =>
  page.getByRole("group").filter({ has: page.getByRole("button", { name: "Light", exact: true }) })
const header = (page: Page) => page.getByRole("main").locator("header").first()
const table = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  page.getByRole("region", { name, exact: true }).getByRole("table", { name, exact: true })
const bodyRows = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  table(page, name).locator("tbody").getByRole("row")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function setTheme(page: Page, theme: "light" | "dark") {
  // Through the real provider: click the sidebar toggle, not a query param.
  await themeSwitch(page).getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

async function openMenu(page: Page, section: "Upcoming clinics" | "Past clinics", clinic: string) {
  await table(page, section).getByRole("button", { name: `Actions for ${clinic}`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every Clinics state (${theme})`, async ({ page, browser }) => {
    const day = todayIn(now())
    await page.goto("/clinics")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)

    // Default, with data: Upcoming over Past.
    await shoot(page, `clinics-with-data-${theme}`)

    // Persistence label, close up.
    for (const dir of OUT_DIRS) {
      await header(page).screenshot({ path: path.join(dir, `clinics-persistence-label-${theme}.png`) })
    }

    // Row menu open.
    await openMenu(page, "Upcoming clinics", "Houston Offensive Staff Clinic")
    await shoot(page, `clinics-row-menu-${theme}`)
    await page.keyboard.press("Escape")

    // Add dialog, filled in.
    await header(page).getByRole("button", { name: "Add clinic", exact: true }).click()
    const add = dialog(page, "Add clinic")
    await add.getByLabel("Name").fill("Katy spring install")
    await add.getByLabel("Host").fill("Katy ISD athletics")
    await add.getByLabel("City").fill("Katy")
    await add.getByRole("group", { name: "Type" }).getByRole("button", { name: "Staff meeting", exact: true }).click()
    await add.getByLabel("Date").fill(addDays(day, 3))
    await shoot(page, `clinics-add-${theme}`)
    await add.getByRole("button", { name: "Add clinic", exact: true }).click()
    await expect(add).toBeHidden()

    // Edit dialog (Record collected on a past clinic).
    const menu = await openMenu(page, "Past clinics", "Spring Houston walk-through")
    await menu.getByRole("menuitem", { name: "Record collected", exact: true }).click()
    const edit = dialog(page, "Edit clinic")
    await expect(edit.getByLabel("Leads")).toBeFocused()
    await edit.getByLabel("Leads").fill("16")
    await shoot(page, `clinics-edit-${theme}`)
    await edit.getByRole("button", { name: "Save changes", exact: true }).click()
    await expect(edit).toBeHidden()

    // Persisted after reload.
    await page.reload()
    await expect(table(page, "Upcoming clinics").getByRole("row", { name: /Katy spring install/ })).toBeVisible()
    await expect(table(page, "Past clinics").getByRole("row", { name: /Spring Houston/ })).toContainText("16 leads")
    await shoot(page, `clinics-persisted-after-reload-${theme}`)

    // Delete confirm.
    const del = await openMenu(page, "Upcoming clinics", "Katy spring install")
    await del.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await expect(dialog(page, "Delete this clinic?")).toBeVisible()
    await shoot(page, `clinics-delete-confirm-${theme}`)
    await dialog(page, "Delete this clinic?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(dialog(page, "Delete this clinic?")).toBeHidden()

    // Reset confirm.
    await header(page).getByRole("button", { name: "Reset", exact: true }).click()
    await expect(dialog(page, "Reset demo data?")).toBeVisible()
    await shoot(page, `clinics-reset-confirm-${theme}`)
    await dialog(page, "Reset demo data?").getByRole("button", { name: "Keep my edits", exact: true }).click()

    // Empty: everything deleted.
    for (const [section, name] of [
      ["Upcoming clinics", "Houston Offensive Staff Clinic"],
      ["Upcoming clinics", "Dallas 7-on-7 Coaches Night"],
      ["Upcoming clinics", "Midweek CHLK walkthrough"],
      ["Upcoming clinics", "Austin staff install"],
      ["Past clinics", "Spring Houston walk-through"],
      ["Past clinics", "Dallas staff huddle"],
      ["Past clinics", "Remote playbook office hours"],
      ["Past clinics", "Fort Worth spring clinic"],
    ] as const) {
      const m = await openMenu(page, section, name)
      await m.getByRole("menuitem", { name: "Delete", exact: true }).click()
      await dialog(page, "Delete this clinic?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this clinic?")).toBeHidden()
      if (name === "Austin staff install") {
        await expect(table(page, "Upcoming clinics").getByRole("status")).toBeVisible()
        await shoot(page, `clinics-upcoming-empty-${theme}`)
      }
    }
    await expect(page.getByRole("status", { name: "No clinics", exact: true })).toBeVisible()
    await shoot(page, `clinics-empty-${theme}`)

    // Back to the seed for the next run.
    await resetDemoData(page, header(page))
    await expect(bodyRows(page, "Upcoming clinics")).toHaveCount(4)

    // Save failed: a browser whose storage refuses our key.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript((k) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (name: string, value: string) {
        if (name === k) throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
        return original.call(this, name, value)
      }
    }, STORAGE_KEY)
    const failing = await context.newPage()
    await failing.goto("/clinics")
    await setTheme(failing, theme)
    const fm = await openMenu(failing, "Upcoming clinics", "Austin staff install")
    await fm.getByRole("menuitem", { name: "Mark skipped", exact: true }).click()
    await expect(persistenceNote(failing, { failed: true })).toHaveText(NOTE.failed)
    await shoot(failing, `clinics-save-failed-${theme}`)
    await context.close()
  })
}
