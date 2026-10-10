import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Metrics at the four target widths, both themes, every
 * tab and main state. Opt-in: `pnpm screens:responsive-metrics`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-metrics-screens.spec.ts`).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/metrics"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.metrics.v2"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

/**
 * Page states are full-page; an open sheet or dialog on phone and tablet
 * is shot at the viewport, where it really sits on the screen.
 */
async function shoot(page: Page, name: string, { fullPage = true }: { fullPage?: boolean } = {}) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

const panel = (page: Page, name: string) => page.getByRole("tabpanel", { name, exact: true })
const grid = (page: Page) => panel(page, "Overview").getByRole("region", { name: "Metric cards" })
const tab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Metrics views" }).getByRole("tab", { name, exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

/** Load with `state` in storage (`null` = the seed) and the theme applied. */
async function open(page: Page, theme: "light" | "dark", state: unknown, path = "/metrics") {
  await page.goto(path)
  await page.evaluate(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    },
    [STORAGE_KEY, state === null ? null : JSON.stringify(state)] as const
  )
  await page.goto(path)
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(state === null ? NOTE.unsaved : NOTE.saved)
  await setTheme(page, theme)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Metrics ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const desktop = size === "desktop"

      await open(page, theme, null)
      await expect(grid(page).getByRole("article")).toHaveCount(8)
      await shoot(page, `metrics-${size}-overview-${theme}`)

      await panel(page, "Overview").getByRole("button", { name: "Add metric", exact: true }).click()
      await expect(dialog(page, "Add a metric")).toBeVisible()
      await shoot(page, `metrics-${size}-overview-add-metric-${theme}`, { fullPage: desktop })
      await closeAll(page)

      await tab(page, "New Subscribers").click()
      await expect(page.getByRole("tabpanel", { name: "New Subscribers" })).toBeVisible()
      await shoot(page, `metrics-${size}-new-${theme}`)

      await tab(page, "Churned Subscribers").click()
      await expect(page.getByRole("tabpanel", { name: "Churned Subscribers" })).toBeVisible()
      await shoot(page, `metrics-${size}-churned-${theme}`)

      await tab(page, "Expenses").click()
      await expect(page.getByRole("tabpanel", { name: "Expenses" })).toBeVisible()
      await shoot(page, `metrics-${size}-expenses-${theme}`)

      await panel(page, "Expenses").getByRole("button", { name: "Add expense", exact: true }).click()
      await expect(dialog(page, "Add expense")).toBeVisible()
      await shoot(page, `metrics-${size}-expenses-add-${theme}`, { fullPage: desktop })
      await closeAll(page)

      await open(page, theme, { visible: [], charts: {}, expenses: [], nextExpenseId: 1, seededAt: "2026-08-21" })
      await expect(panel(page, "Overview").getByRole("status", { name: "Empty board" })).toBeVisible()
      await shoot(page, `metrics-${size}-overview-empty-${theme}`)
    })
  }
}
