import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { addDays, now, todayIn } from "../src/lib/clock"
import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for Community Development, every main state in both
 * themes at desktop width. Opt-in: `pnpm screens:community-development`
 * (CI=true so Playwright starts the production server). Output goes to
 * docs/screenshots/community-development and, when SCREENSHOT_DIR is set,
 * there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/community-development"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.community-development.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const table = (page: Page) => page.getByRole("table", { name: "Giving initiatives", exact: true })
const bodyRows = (page: Page) => table(page).locator("tbody").getByRole("row")
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function openMenu(page: Page, name: string) {
  await table(page).getByRole("button", { name: `Actions for ${name}`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every Community Development state (${theme})`, async ({ page }) => {
    const day = todayIn(now())
    await page.goto("/community-development?preview=skeleton")
    await setTheme(page, theme)
    await expect(page.getByRole("status", { name: "Loading saved initiatives" })).toBeVisible()
    await shoot(page, `community-development-skeleton-${theme}`)

    await page.goto("/community-development")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(bodyRows(page)).toHaveCount(8)

    await shoot(page, `community-development-with-data-${theme}`)

    await page.getByRole("group", { name: "Filter by type" }).getByRole("button", { name: "Volunteer", exact: true }).click()
    await expect(bodyRows(page)).toHaveCount(3)
    await shoot(page, `community-development-filtered-${theme}`)
    await page.getByRole("group", { name: "Filter by type" }).getByRole("button", { name: "All types", exact: true }).click()

    await header(page).getByRole("button", { name: "Add initiative", exact: true }).click()
    const add = dialog(page, "Add initiative")
    await add.getByLabel("Name").fill("Saturday park clean-up")
    await add.getByLabel("Beneficiary / partner").fill("Buffalo Bayou Park")
    await add.getByRole("group", { name: "Type" }).getByRole("button", { name: "Outreach event", exact: true }).click()
    await add.getByLabel("Date").fill(addDays(day, 4))
    await shoot(page, `community-development-add-${theme}`)
    await add.getByRole("button", { name: "Add initiative", exact: true }).click()
    await expect(add).toBeHidden()

    const menu = await openMenu(page, "Saturday park clean-up")
    await menu.getByRole("menuitem", { name: "Edit", exact: true }).click()
    const edit = dialog(page, "Edit initiative")
    await expect(edit.getByLabel("Name")).toBeFocused()
    await shoot(page, `community-development-edit-${theme}`)
    await edit.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(edit).toBeHidden()

    await table(page).getByRole("button", { name: "Saturday park clean-up", exact: true }).click()
    const detail = page.getByRole("dialog", { name: /Saturday park clean-up/ })
    await expect(detail).toBeVisible()
    await shoot(page, `community-development-detail-${theme}`)
    await page.keyboard.press("Escape")
    await expect(detail).toBeHidden()

    const del = await openMenu(page, "Saturday park clean-up")
    await del.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await expect(dialog(page, "Delete this initiative?")).toBeVisible()
    await shoot(page, `community-development-delete-confirm-${theme}`)
    await dialog(page, "Delete this initiative?").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(dialog(page, "Delete this initiative?")).toBeHidden()

    await header(page).getByRole("button", { name: "Reset", exact: true }).click()
    await expect(dialog(page, "Reset demo data?")).toBeVisible()
    await shoot(page, `community-development-reset-confirm-${theme}`)
    await dialog(page, "Reset demo data?").getByRole("button", { name: "Keep my edits", exact: true }).click()

    for (const name of [
      "Equipment drive for Yates High School",
      "Saturday volunteer coaching at Alief rec",
      "Youth flag-football clinic volunteer day",
      "Coaches serve-day at the Houston Food Bank",
      "Free play-calling clinic for middle-school coaches",
      "Chlk Foundation coaching scholarship",
      "Booster-club talk on giving back",
      "Refurbished iPads for a Title I program",
    ]) {
      const m = await openMenu(page, name)
      await m.getByRole("menuitem", { name: "Delete", exact: true }).click()
      await dialog(page, "Delete this initiative?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this initiative?")).toBeHidden()
    }
    await expect(page.getByRole("status", { name: "No initiatives", exact: true })).toBeVisible()
    await shoot(page, `community-development-empty-${theme}`)

    await resetDemoData(page, header(page))
    await expect(bodyRows(page)).toHaveCount(8)

    await page.goto("/community-development?preview=error")
    await setTheme(page, theme)
    await expect(page.getByRole("heading", { name: /Community Development couldn.t render/ })).toBeVisible()
    await shoot(page, `community-development-error-${theme}`)
  })
}
