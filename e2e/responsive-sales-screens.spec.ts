import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Sales Opportunities at the four target widths, both themes.
 * Opt-in: `pnpm screens:responsive-sales`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-sales-screens.spec.ts`).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/sales"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.sales-opportunities.v1"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

const screen = (page: Page) => page.getByRole("region", { name: "Sales Opportunities", exact: true })
const deals = (page: Page) => screen(page).getByRole("region", { name: "Deals", exact: true })
const table = (page: Page) => deals(page).getByRole("table", { name: "Deals", exact: true })

/** Load with `state` in storage (`null` = the seed) and the theme applied. */
async function open(page: Page, theme: "light" | "dark", state: unknown) {
  await page.goto("/sales-opportunities")
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
    test(`Sales ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const phone = size === "phone"

      await open(page, theme, null)
      await expect(deals(page).getByRole("heading", { level: 2, name: "Open deals" })).toBeVisible()
      await shoot(page, `sales-${size}-with-data-${theme}`)

      // Detail: phone opens the card's bottom sheet; wider sizes the Edit dialog.
      if (phone) {
        await deals(page).getByRole("list").getByRole("button", { name: /^Coach Lonnie Pruitt/ }).click()
        await expect(page.getByRole("dialog", { name: "Coach Lonnie Pruitt", exact: true })).toBeVisible()
      } else if (size === "desktop") {
        await table(page).getByRole("button", { name: "Edit Coach Lonnie Pruitt" }).click()
      } else {
        await table(page).getByRole("button", { name: "More actions for Coach Lonnie Pruitt" }).click()
        await page.getByRole("menu").getByRole("menuitem", { name: "Edit deal" }).click()
      }
      if (!phone) await expect(page.getByRole("dialog", { name: "Edit deal", exact: true })).toBeVisible()
      await shoot(page, `sales-${size}-detail-${theme}`)
      await page.keyboard.press("Escape")

      // Empty: no deals at all.
      await open(page, theme, { deals: [], nextId: 1 })
      await expect(deals(page).getByRole("status", { name: "No deals" })).toContainText("No live deals")
      await shoot(page, `sales-${size}-empty-${theme}`)
    })
  }
}
