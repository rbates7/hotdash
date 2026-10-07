import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for the Bugs page, every main state in both themes
 * at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:bugs`). Output goes to docs/screenshots/bugs and,
 * when SCREENSHOT_DIR is set, there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/bugs"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.agent-workplace.v2"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string, locator?: ReturnType<Page["locator"]>) {
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    if (locator) {
      await locator.screenshot({ path: path.join(dir, `${name}.png`) })
    } else {
      await page.screenshot({ path: path.join(dir, `${name}.png`) })
    }
  }
}

async function fresh(page: Page, path = "/bugs") {
  await page.goto(path)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every Bugs state (${theme})`, async ({ page }) => {
    await fresh(page)
    await setTheme(page, theme)
    await expect(page.getByRole("region", { name: "Bug list" })).toBeVisible()
    await expect(page.getByRole("article", { name: "Crashes" }).getByTestId("crash-count")).toHaveText("8")

    await shoot(page, `bugs-list-${theme}`)
    await shoot(page, `bugs-crash-card-${theme}`, page.getByRole("article", { name: "Crashes", exact: true }))

    // The Workplace's own ticket view, showing the bug tag.
    await page.goto("/agent-workplace?issue=CHLK-419")
    await expect(page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })).toBeVisible()
    await expect(page.getByTestId("bug-tag")).toHaveText("Bug · Crash")
    await shoot(page, `bugs-workplace-ticket-${theme}`)

    await page.goto("/bugs")
    for (const [key, from] of [
      ["CHLK-419", "To Do"],
      ["CHLK-404", "In Progress"],
      ["CHLK-420", "In Review"],
    ] as const) {
      await page.goto(`/bugs?issue=${key}`)
      const rail = page.getByRole("complementary", { name: "Ticket properties" })
      await rail.getByRole("button", { name: from, exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
      await page.keyboard.press("Escape")
    }
    await page.goto("/bugs")
    await expect(page.getByRole("status", { name: "Empty bug list" })).toHaveText("No open bugs")
    await shoot(page, `bugs-empty-${theme}`)

    await resetDemoData(page, page.locator("main header").first())
    await expect(page.getByRole("region", { name: "Bug list" }).getByText("3 open · 1 fixed")).toBeVisible()
  })
}
