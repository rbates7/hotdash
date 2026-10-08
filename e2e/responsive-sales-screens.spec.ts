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

/**
 * Page states are full-page; an open sheet, dialog or menu on phone and
 * tablet is shot at the viewport, where it really sits on the screen.
 */
async function shoot(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

const PRUITT = "Coach Lonnie Pruitt"

/** Phone: open Pruitt's card sheet and pick `action`. Tablet: the row "…" (or the stage pill). */
async function openAction(page: Page, phone: boolean, action: "Edit deal" | "Delete deal" | "Move stage") {
  if (phone) {
    await deals(page).getByRole("list").getByRole("button", { name: new RegExp(`^${PRUITT}`) }).click()
    const sheet = page.getByRole("dialog", { name: PRUITT, exact: true })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("group", { name: "Deal actions" }).getByRole("button").filter({ hasText: action }).click()
  } else if (action === "Move stage") {
    await table(page).getByRole("row", { name: /Pruitt/ }).getByRole("button", { name: /^Stage: / }).click()
  } else {
    await table(page).getByRole("button", { name: `More actions for ${PRUITT}` }).click()
    await page.getByRole("menu").getByRole("menuitem", { name: action }).click()
  }
}

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").or(page.getByRole("menu")).count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
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

      // Detail: phone opens the card's bottom sheet (with its ×); wider sizes the Edit dialog.
      const desktop = size === "desktop"
      if (phone) {
        await deals(page).getByRole("list").getByRole("button", { name: new RegExp(`^${PRUITT}`) }).click()
        const sheet = page.getByRole("dialog", { name: PRUITT, exact: true })
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeVisible()
      } else if (desktop) {
        await table(page).getByRole("button", { name: `Edit ${PRUITT}` }).click()
      } else {
        await openAction(page, false, "Edit deal")
      }
      if (!phone) await expect(page.getByRole("dialog", { name: "Edit deal", exact: true })).toBeVisible()
      await shoot(page, `sales-${size}-detail-${theme}`, { fullPage: desktop })
      await closeAll(page)

      // Below 1280: the touch-sized dialogs and stage menu (B1).
      if (!desktop) {
        await (phone
          ? screen(page).locator("header")
          : deals(page)
        ).getByRole("button", { name: "Add deal", exact: true }).click()
        await expect(page.getByRole("dialog", { name: "Add deal", exact: true })).toBeVisible()
        await shoot(page, `sales-${size}-dialog-add-${theme}`, { fullPage: false })
        await closeAll(page)

        if (phone) {
          await openAction(page, true, "Edit deal")
          await expect(page.getByRole("dialog", { name: "Edit deal", exact: true })).toBeVisible()
          await shoot(page, `sales-${size}-dialog-edit-${theme}`, { fullPage: false })
          await closeAll(page)
        }

        await openAction(page, phone, "Delete deal")
        await expect(page.getByRole("dialog", { name: "Delete this deal?", exact: true })).toBeVisible()
        await shoot(page, `sales-${size}-dialog-delete-${theme}`, { fullPage: false })
        await closeAll(page)

        await openAction(page, phone, "Move stage")
        await expect(page.getByRole("menu")).toBeVisible()
        await shoot(page, `sales-${size}-stage-menu-${theme}`, { fullPage: false })
        await closeAll(page)
      }

      // Empty: no deals at all.
      await open(page, theme, { deals: [], nextId: 1 })
      await expect(deals(page).getByRole("status", { name: "No deals" })).toContainText("No live deals")
      await shoot(page, `sales-${size}-empty-${theme}`)
    })
  }
}
