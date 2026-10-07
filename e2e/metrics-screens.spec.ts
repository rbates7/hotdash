import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review screenshots for the Metrics page, every main state in both themes
 * at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:metrics`). Output goes to docs/screenshots/metrics and,
 * when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/metrics"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.metrics.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

async function setTheme(page: Page, theme: "light" | "dark") {
  // Through the real provider: click the sidebar toggle, not a query param.
  await page.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

// Role lookups are scoped by name, directly or through a named ancestor.
const grid = (page: Page) => page.getByRole("region", { name: "Metric cards" })
const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true })
const tab = (page: Page, name: string) =>
  page.getByRole("tablist", { name: "Metrics views" }).getByRole("tab", { name, exact: true })

for (const theme of ["light", "dark"] as const) {
  test(`captures every Metrics state (${theme})`, async ({ page }) => {
    await page.goto("/metrics")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(page.getByTestId("persistence-note")).toHaveText("Saved in this browser")
    await expect(card(page, "MRR").getByRole("img", { name: "MRR, six-month bar chart" })).toBeVisible()

    // Overview with data.
    await shoot(page, `metrics-overview-${theme}`)

    // Persistence label, close up.
    for (const dir of OUT_DIRS) {
      await page.locator("main header").first().screenshot({
        path: path.join(dir, `metrics-persistence-label-${theme}.png`),
      })
    }

    // Add-metric picker open.
    await page.getByRole("button", { name: "Add metric", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "Add a metric" })).toBeVisible()
    await shoot(page, `metrics-overview-add-metric-${theme}`)

    // Editing: an extra added, a default removed, a card switched to line.
    await page.getByRole("dialog", { name: "Add a metric" }).getByRole("button", { name: /^Valuation/ }).click()
    await card(page, "ARR").getByRole("button", { name: "Remove ARR" }).click()
    await card(page, "MRR").getByRole("button", { name: "MRR: line chart" }).click()
    await expect(card(page, "Valuation")).toBeVisible()
    await shoot(page, `metrics-overview-editing-${theme}`)

    await page.reload()
    await expect(card(page, "Valuation")).toBeVisible()
    await expect(card(page, "MRR").getByRole("button", { name: "MRR: line chart" })).toHaveAttribute("aria-pressed", "true")
    await shoot(page, `metrics-overview-persisted-after-reload-${theme}`)

    // Empty board.
    for (const name of ["MRR", "Churn Rate", "Revenue", "Retention", "Subscribers", "Trial Conversions", "Expenses", "Valuation"]) {
      await card(page, name).getByRole("button", { name: `Remove ${name}` }).click()
    }
    await expect(page.getByRole("status", { name: "Empty board" })).toBeVisible()
    await shoot(page, `metrics-overview-empty-${theme}`)
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(grid(page).getByRole("article")).toHaveCount(8)

    // Tables.
    await tab(page, "New Subscribers").click()
    await expect(page.getByRole("table", { name: "New subscribers" })).toBeVisible()
    await shoot(page, `metrics-new-subscribers-${theme}`)

    await tab(page, "Churned Subscribers").click()
    await expect(page.getByRole("table", { name: "Churned subscribers" })).toBeVisible()
    await shoot(page, `metrics-churned-subscribers-${theme}`)

    await tab(page, "Expenses").click()
    await expect(page.getByRole("table", { name: "Expenses" })).toBeVisible()
    await expect(card(page, "Expenses").getByRole("img", { name: "Expenses, six-month bar chart" })).toBeVisible()
    await shoot(page, `metrics-expenses-${theme}`)

    // Add-expense dialog, filled in.
    await page.getByRole("button", { name: "Add expense", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Add expense" })
    await dialog.getByRole("textbox", { name: "Category" }).fill("Vercel")
    await dialog.getByRole("spinbutton", { name: "Amount" }).fill("160")
    await dialog.getByRole("switch", { name: "Recurring" }).click()
    await shoot(page, `metrics-expenses-add-${theme}`)
    await dialog.getByRole("button", { name: "Add expense", exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.reload()
    await expect(page.getByRole("table", { name: "Expenses", exact: true }).getByRole("row", { name: /Vercel/ })).toBeVisible()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,400")
    await shoot(page, `metrics-expenses-persisted-after-reload-${theme}`)

    // Back to the seed for the next run.
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(card(page, "Expenses").getByTestId("metric-value")).toHaveText("$8,240")
  })
}
