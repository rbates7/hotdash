import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { ROW_COLLAPSE_SLOT } from "../src/components/responsive-table"
import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Community Development at the four Deke widths, both
 * themes, every main state. Opt-in: `SCREENSHOTS=1` or
 * `pnpm screens:responsive-community-development`.
 * Output: docs/screenshots/responsive/community-development/
 *
 * Page states are full-page; an open sheet, dialog or menu on phone and
 * tablet is shot at the viewport, where it really sits on the screen.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/community-development"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.community-development.v1"
const YATES = "Equipment drive for Yates High School"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const section = (page: Page) => page.getByRole("region", { name: "Giving initiatives", exact: true })
const table = (page: Page) => section(page).getByRole("table", { name: "Giving initiatives", exact: true })
const cards = (page: Page) => section(page).locator(`[data-slot='${ROW_COLLAPSE_SLOT}']:visible`)
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").or(page.getByRole("menu")).count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

async function open(page: Page, theme: "light" | "dark", state: unknown) {
  await page.goto("/community-development")
  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    },
    [STORAGE_KEY, state === null ? null : JSON.stringify(state)] as const
  )
  await page.reload()
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(state === null ? NOTE.unsaved : NOTE.saved)
  await setTheme(page, theme)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Community Development ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const phone = size === "phone"
      const desktop = size === "desktop"

      await open(page, theme, null)
      if (phone) await expect(cards(page)).toHaveCount(8)
      else await expect(table(page).locator("tbody").getByRole("row")).toHaveCount(8)
      await shoot(page, `community-development-${size}-with-data-${theme}`)

      if (phone) {
        await cards(page).first().click()
        const sheet = dialog(page, "Edit initiative")
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeVisible()
        await expect(sheet.getByRole("button", { name: "View", exact: true })).toBeVisible()
        await expect(sheet.getByRole("button", { name: "Delete initiative", exact: true })).toBeVisible()
        await shoot(page, `community-development-${size}-sheet-${theme}`, { fullPage: false })
        await sheet.getByRole("button", { name: "View", exact: true }).click()
        const view = page.getByRole("dialog", { name: new RegExp(`^${YATES}`) })
        await expect(view).toBeVisible()
        await shoot(page, `community-development-${size}-view-${theme}`, { fullPage: false })
      } else {
        await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
        await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
        await expect(dialog(page, "Edit initiative")).toBeVisible()
        await shoot(
          page,
          desktop ? `community-development-${size}-dialog-edit-${theme}` : `community-development-${size}-sheet-${theme}`,
          { fullPage: desktop }
        )
      }
      await closeAll(page)

      if (!desktop) {
        await header(page).getByRole("button", { name: "Add initiative", exact: true }).click()
        await expect(dialog(page, "Add initiative")).toBeVisible()
        await shoot(page, `community-development-${size}-dialog-add-${theme}`, { fullPage: false })
        await closeAll(page)

        if (phone) {
          await cards(page).first().click()
          await dialog(page, "Edit initiative")
            .getByRole("button", { name: "Delete initiative", exact: true })
            .click()
        } else {
          await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
          await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
        }
        await expect(dialog(page, "Delete this initiative?")).toBeVisible()
        await shoot(page, `community-development-${size}-dialog-delete-${theme}`, { fullPage: false })
        await closeAll(page)

        if (!phone) {
          await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
          await expect(page.getByRole("menu")).toBeVisible()
          await shoot(page, `community-development-${size}-row-menu-${theme}`, { fullPage: false })
          await closeAll(page)
        }
      } else {
        await header(page).getByRole("button", { name: "Add initiative", exact: true }).click()
        await expect(dialog(page, "Add initiative")).toBeVisible()
        await shoot(page, `community-development-${size}-dialog-add-${theme}`, { fullPage: false })
        await closeAll(page)

        await table(page).getByRole("button", { name: `Actions for ${YATES}`, exact: true }).click()
        await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
        await expect(dialog(page, "Delete this initiative?")).toBeVisible()
        await shoot(page, `community-development-${size}-dialog-delete-${theme}`, { fullPage: false })
        await closeAll(page)
      }

      await open(page, theme, { initiatives: [], nextId: 9 })
      await expect(page.getByRole("status", { name: "No initiatives" })).toBeVisible()
      await shoot(page, `community-development-${size}-empty-${theme}`)
    })
  }
}
