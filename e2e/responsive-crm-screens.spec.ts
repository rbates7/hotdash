import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for the CRM at the four target widths, both themes.
 * Opt-in: `pnpm screens:responsive-crm`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-crm-screens.spec.ts`).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/crm"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.crm.v1"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

const STAFF_SEATS = "Staff seats invite fails on the iPad"

const main = (page: Page) => page.getByRole("main")
const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM sections", exact: true })
const cardList = (page: Page) => main(page).locator("[data-slot='responsive-table']").getByRole("list")

/**
 * Page states are full-page; an open sheet, dialog or menu is shot at the
 * viewport, where it really sits on the screen.
 */
async function shoot(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").or(page.getByRole("menu")).count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

/** Go to `path` and wait for the saved copy (or the seed) to load. */
async function visit(page: Page, pathname: string) {
  await page.goto(pathname)
  await waitForHydration(page)
  await expect(persistenceNote(page)).not.toHaveText(/^Loading/)
  await expect(main(page).getByRole("status", { name: /^Loading saved/ })).toHaveCount(0)
}

type CrmState = {
  cases: { id: string }[]
  notes: { caseId: string }[]
  messages: { caseId: string | null }[]
  [key: string]: unknown
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`CRM ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const phone = size === "phone"
      const desktop = size === "desktop"
      const name = (state: string) => `crm-${size}-${state}-${theme}`

      await page.goto("/crm")
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
      await visit(page, "/crm")
      await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
      await setTheme(page, theme)
      await expect(page.getByText(/6 contacts/)).toBeVisible()
      await shoot(page, name("overview"))

      await crmNav(page).getByRole("link", { name: "Cases", exact: true }).click()
      await expect(main(page).getByRole("heading", { level: 2, name: "Cases" })).toBeVisible()
      await shoot(page, name("cases"))

      // Row actions: phone opens the card's sheet; tablet the row "…".
      if (!desktop) {
        if (phone) {
          await cardList(page).getByRole("button", { name: new RegExp(`^${STAFF_SEATS}`) }).click()
          await expect(page.getByRole("dialog", { name: STAFF_SEATS, exact: true })).toBeVisible()
        } else {
          await main(page).getByRole("button", { name: `More actions for #1 ${STAFF_SEATS}` }).click()
          await expect(page.getByRole("menu")).toBeVisible()
        }
        await shoot(page, name("cases-actions"), { fullPage: false })
        await closeAll(page)
      }

      await crmNav(page).getByRole("link", { name: "Contacts", exact: true }).click()
      await expect(main(page).getByRole("heading", { level: 2, name: "Contacts" })).toBeVisible()
      await shoot(page, name("contacts"))

      // Edit contact, opened the way this width opens it.
      if (phone) {
        await cardList(page).getByRole("button", { name: /^Marcus Hale/ }).click()
        await page
          .getByRole("dialog", { name: "Marcus Hale", exact: true })
          .getByRole("button", { name: "Edit contact" })
          .click()
      } else if (desktop) {
        await main(page).getByRole("link", { name: /Marcus Hale/ }).click()
        await expect(main(page).getByRole("heading", { level: 2, name: /Marcus Hale/ })).toBeVisible()
        await main(page).getByRole("button", { name: "Edit", exact: true }).click()
      } else {
        await main(page).getByRole("button", { name: "More actions for Marcus Hale" }).click()
        await page.getByRole("menu").getByRole("menuitem", { name: "Edit contact" }).click()
      }
      await expect(page.getByRole("dialog", { name: "Edit contact", exact: true })).toBeVisible()
      await shoot(page, name("contact-edit"), { fullPage: false })
      await closeAll(page)

      await visit(page, "/crm/cases/case-1")
      await expect(main(page).getByRole("heading", { level: 2, name: new RegExp(STAFF_SEATS) })).toBeVisible()
      await shoot(page, name("case-detail"))

      await visit(page, "/crm/triage")
      await expect(page.getByText("Riley Nash")).toBeVisible()
      await shoot(page, name("triage"))

      // Empty: every case gone (one real save, then the cases dropped).
      await visit(page, "/crm/cases/case-1")
      await page.getByRole("group", { name: "Case status" }).getByRole("button", { name: "Waiting on customer" }).click()
      await expect(persistenceNote(page)).toHaveText(NOTE.saved)
      const state: CrmState = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!)
      const empty = { ...state, cases: [], notes: [], messages: state.messages.filter((m) => m.caseId === null) }
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(empty)] as const)
      await visit(page, "/crm/cases")
      await expect(main(page).getByRole("status", { name: "No cases" })).toBeVisible()
      await shoot(page, name("cases-empty"))
    })
  }
}
