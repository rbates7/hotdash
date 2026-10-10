import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, NOTE_NAME } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Product Roadmap at the four target widths, both themes.
 * Opt-in against a production build so the Next.js dev “N” badge is absent:
 * `pnpm build && CI=true SCREENSHOTS=1 playwright test e2e/responsive-roadmap-screens.spec.ts`
 * (or `pnpm screens:responsive-roadmap` after a build).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/roadmap"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.product-roadmap.v1"

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

const board = (page: Page) => page.getByRole("region", { name: "Roadmap sequence", exact: true })
const card = (page: Page, title: string) =>
  board(page).getByRole("article", { name: title, exact: true })
const persistence = (page: Page) =>
  page.getByRole("status", { name: NOTE_NAME, exact: true })
const actions = (page: Page) => page.getByRole("group", { name: "Page actions", exact: true })

async function open(page: Page, theme: "light" | "dark", empty: boolean) {
  await page.goto("/product-roadmap")
  await page.evaluate(
    ([key, clear]) => {
      if (clear) localStorage.setItem(key, JSON.stringify({ items: [], nextId: 1 }))
      else localStorage.removeItem(key)
    },
    [STORAGE_KEY, empty] as const
  )
  await page.reload()
  await waitForHydration(page)
  await expect(persistence(page)).toHaveText(empty ? NOTE.saved : NOTE.unsaved)
  await setTheme(page, theme)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Product Roadmap ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const overlay = size !== "desktop"

      await open(page, theme, false)
      await expect(card(page, "Flag Football 2026")).toBeVisible()
      await shoot(page, `roadmap-${size}-with-data-${theme}`)

      await card(page, "Flag Football 2026").getByRole("button", { name: "Edit" }).click()
      await expect(page.getByRole("dialog", { name: "Bet: Flag Football 2026" })).toBeVisible()
      await shoot(page, `roadmap-${size}-detail-${theme}`, { fullPage: !overlay })
      await page.getByRole("button", { name: "Delete", exact: true }).click()
      await expect(page.getByRole("button", { name: "Confirm delete", exact: true })).toBeVisible()
      await shoot(page, `roadmap-${size}-delete-confirm-${theme}`, { fullPage: !overlay })
      await page.keyboard.press("Escape")

      const newBet =
        size === "phone"
          ? page.getByRole("main").locator("header").getByRole("button", { name: "New bet", exact: true })
          : actions(page).getByRole("button", { name: "New bet", exact: true })
      await newBet.click()
      await expect(page.getByRole("dialog", { name: "New bet" })).toBeVisible()
      await shoot(page, `roadmap-${size}-new-bet-${theme}`, { fullPage: !overlay })
      await page.keyboard.press("Escape")

      if (size === "phone" || size === "tablet-portrait") {
        await page.getByRole("group", { name: "Filter by column" }).getByRole("button", { name: /Next/ }).click()
        await expect(card(page, "Web import from a link")).toBeVisible()
        await shoot(page, `roadmap-${size}-next-${theme}`)
      }

      await open(page, theme, true)
      await expect(page.getByRole("status", { name: "Empty board" })).toBeVisible()
      await shoot(page, `roadmap-${size}-empty-${theme}`)
    })
  }
}
