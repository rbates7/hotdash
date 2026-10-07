import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review screenshots for the Product Roadmap screen, every main state in
 * both themes at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:roadmap`). Output goes to docs/screenshots/product-roadmap
 * and, when SCREENSHOT_DIR is set, there too.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const STORAGE_KEY = "hotdash.product-roadmap.v1"

const OUT_DIRS = [
  path.resolve("docs/screenshots/product-roadmap"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) => page.getByRole("article", { name: title, exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })
const persistence = (page: Page) => page.getByTestId("persistence-note")

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

for (const theme of ["light", "dark"] as const) {
  test(`captures every Product Roadmap state (${theme})`, async ({ page }) => {
    await page.goto("/product-roadmap")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistence(page)).toHaveText("Edits save in this browser")

    // With data (the seed).
    await shoot(page, `product-roadmap-board-${theme}`)

    // Persistence label, close up (before any save).
    for (const dir of OUT_DIRS) {
      await page.locator("main header").first().screenshot({
        path: path.join(dir, `product-roadmap-persistence-label-${theme}.png`),
      })
    }

    // Adding.
    await page.getByRole("button", { name: "New bet", exact: true }).click()
    const add = dialog(page, "New bet")
    await add.getByRole("textbox", { name: "Bet title" }).fill("Practice plan templates")
    await add.getByRole("textbox", { name: "Why it matters" }).fill("Reusable weekly plans a coach can tweak.")
    await add.getByRole("textbox", { name: "Target window" }).fill("Q1 2027")
    await add.getByRole("group", { name: "Owner" }).getByRole("button", { name: "Mace", exact: true }).click()
    await add.getByRole("group", { name: "Column" }).getByRole("button", { name: "Next", exact: true }).click()
    await shoot(page, `product-roadmap-adding-${theme}`)
    await add.getByRole("button", { name: /Add bet/ }).click()
    await expect(add).toBeHidden()
    await expect(card(page, "Practice plan templates")).toBeVisible()

    // Editing.
    await card(page, "Web import from a link").getByRole("button", { name: "Edit", exact: true }).click()
    const edit = dialog(page, "Bet: Web import from a link")
    await edit.getByRole("textbox", { name: "Bet title" }).fill("Import a play from a HUDL link")
    await edit.getByRole("textbox", { name: "Target window" }).fill("Dec 2026")
    await shoot(page, `product-roadmap-editing-${theme}`)
    await edit.getByRole("button", { name: /Save/ }).click()
    await expect(edit).toBeHidden()

    // Moved + reordered: the new bet into Now and up to the top; a seed card down one.
    const added = card(page, "Practice plan templates")
    await added.getByRole("button", { name: "Move to Now", exact: true }).click()
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    await added.getByRole("button", { name: "Move up", exact: true }).click()
    await card(page, "Flag Football 2026").getByRole("button", { name: "Move down", exact: true }).click()
    await expect(column(page, "Now").getByRole("article").first()).toHaveAccessibleName("Practice plan templates")
    await shoot(page, `product-roadmap-moved-reordered-${theme}`)

    // Persisted after reload.
    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(column(page, "Now").getByRole("article").first()).toHaveAccessibleName("Practice plan templates")
    await expect(column(page, "Next").getByRole("article", { name: "Import a play from a HUDL link", exact: true })).toBeVisible()
    await shoot(page, `product-roadmap-persisted-after-reload-${theme}`)

    // Delete confirm step.
    await card(page, "Parent recap emails").getByRole("button", { name: "Edit", exact: true }).click()
    const del = dialog(page, "Bet: Parent recap emails")
    await del.getByRole("button", { name: "Delete", exact: true }).click()
    await expect(del.getByRole("button", { name: "Confirm delete", exact: true })).toBeVisible()
    await shoot(page, `product-roadmap-delete-confirm-${theme}`)
    await page.keyboard.press("Escape")

    // Empty board.
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ items: [], nextId: 1 })), STORAGE_KEY)
    await page.reload()
    await expect(page.getByRole("status", { name: "Empty board" })).toBeVisible()
    await shoot(page, `product-roadmap-empty-${theme}`)

    // Back to the seed for the next run.
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await dialog(page, "Reset the roadmap?").getByRole("button", { name: "Confirm reset", exact: true }).click()
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(8)
  })
}
