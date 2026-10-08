import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { ROW_COLLAPSE_SLOT } from "../src/components/responsive-table"
import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Clinics at the four Deke widths, both themes, every
 * main state. Opt-in: `SCREENSHOTS=1` or `pnpm screens:responsive-clinics`.
 * Output: docs/screenshots/responsive/clinics/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/clinics"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.clinics.v1"

const SIZES = {
  390: { width: 390, height: 844 },
  820: { width: 820, height: 1180 },
  1180: { width: 1180, height: 820 },
  1440: { width: 1440, height: 900 },
} as const

const region = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  page.getByRole("region", { name, exact: true })
const table = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  region(page, name).getByRole("table", { name, exact: true })
const cards = (page: Page, name: "Upcoming clinics" | "Past clinics") =>
  region(page, name).locator(`[data-slot='${ROW_COLLAPSE_SLOT}']`)
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function shoot(page: Page, name: string) {
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

async function gotoSeed(page: Page) {
  await page.goto("/clinics")
  await waitForHydration(page)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

async function openDetail(page: Page, width: number) {
  if (width < 768) {
    await cards(page, "Upcoming clinics").first().click()
  } else {
    await table(page, "Upcoming clinics")
      .getByRole("button", { name: "Actions for Houston Offensive Staff Clinic", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  }
  await expect(dialog(page, "Edit clinic")).toBeVisible()
}

async function showEmpty(page: Page) {
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ clinics: [], nextId: 9 })), STORAGE_KEY)
  await page.reload()
  await waitForHydration(page)
  await expect(page.getByRole("status", { name: "No clinics", exact: true })).toBeVisible()
}

for (const theme of ["light", "dark"] as const) {
  for (const [widthLabel, viewport] of Object.entries(SIZES)) {
    const width = Number(widthLabel)
    test(`clinics ${widthLabel} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await gotoSeed(page)
      await setTheme(page, theme)

      if (width < 768) {
        await expect(cards(page, "Upcoming clinics")).toHaveCount(4)
      } else {
        await expect(table(page, "Upcoming clinics").locator("tbody").getByRole("row")).toHaveCount(4)
      }
      await shoot(page, `clinics-with-data-${widthLabel}-${theme}`)

      await openDetail(page, width)
      await shoot(page, `clinics-detail-open-${widthLabel}-${theme}`)
      await page.keyboard.press("Escape")
      await expect(dialog(page, "Edit clinic")).toBeHidden()

      await showEmpty(page)
      await setTheme(page, theme)
      await shoot(page, `clinics-empty-${widthLabel}-${theme}`)
    })
  }
}
