import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review screenshots for the Feature Request screen, every main state in
 * both themes at desktop width. Opt-in: `SCREENSHOTS=1 pnpm test:e2e` (or
 * `pnpm screens:feature-request`). Output goes to
 * docs/screenshots/feature-request and, when SCREENSHOT_DIR is set, there too.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const STORAGE_KEY = "hotdash.feature-requests.v1"

const OUT_DIRS = [
  path.resolve("docs/screenshots/feature-request"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true })
const card = (page: Page, title: string) =>
  page.getByRole("button", { name: `Open idea: ${title}`, exact: true })
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
  test(`captures every Feature Request state (${theme})`, async ({ page }) => {
    await page.goto("/feature-request")
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await setTheme(page, theme)
    await expect(persistence(page)).toHaveText("Edits save in this browser")

    // With data (the seed).
    await shoot(page, `feature-request-board-${theme}`)

    // Persistence label, close up.
    for (const dir of OUT_DIRS) {
      await page.locator("main header").first().screenshot({
        path: path.join(dir, `feature-request-persistence-label-${theme}.png`),
      })
    }

    // Adding.
    await page.getByRole("button", { name: "New idea", exact: true }).click()
    const add = dialog(page, "New idea")
    await add.getByRole("textbox", { name: "Idea title" }).fill("Practice plan templates")
    await add.getByRole("textbox", { name: "The ask" }).fill("Reusable weekly plans a coach can tweak.")
    await shoot(page, `feature-request-new-idea-${theme}`)
    await add.getByRole("button", { name: /Add idea/ }).click()
    await expect(add).toBeHidden()
    await expect(card(page, "Practice plan templates")).toBeVisible()
    await shoot(page, `feature-request-board-with-added-idea-${theme}`)

    // Detail / editing.
    await card(page, "Web import from a link").click()
    const edit = dialog(page, "Idea: Web import from a link")
    await expect(edit).toBeVisible()
    await shoot(page, `feature-request-idea-detail-${theme}`)
    await edit.getByRole("textbox", { name: "Idea title" }).fill("Import a play from a HUDL link")
    await edit.getByRole("group", { name: "Status" }).getByRole("button", { name: "Triaged", exact: true }).click()
    await shoot(page, `feature-request-idea-editing-${theme}`)
    await edit.getByRole("button", { name: /Save/ }).click()
    await expect(edit).toBeHidden()

    // Send to Roadmap, then the roadmap-side note.
    await card(page, "Custom play headers").click()
    await dialog(page, "Idea: Custom play headers").getByRole("button", { name: "Send to Roadmap", exact: true }).click()
    await expect(column(page, "On Roadmap").getByRole("button", { name: "Open idea: Custom play headers" })).toBeVisible()
    await card(page, "Custom play headers").click()
    await expect(dialog(page, "Idea: Custom play headers")).toContainText("On Roadmap here only.")
    await shoot(page, `feature-request-on-roadmap-note-${theme}`)
    await page.keyboard.press("Escape")

    // Persisted after reload.
    await page.reload()
    await expect(persistence(page)).toHaveText("Saved in this browser")
    await expect(card(page, "Practice plan templates")).toBeVisible()
    await expect(column(page, "Triaged").getByRole("button", { name: "Open idea: Import a play from a HUDL link" })).toBeVisible()
    await shoot(page, `feature-request-persisted-after-reload-${theme}`)

    // Delete confirm step.
    await card(page, "Parent recap emails").click()
    await dialog(page, "Idea: Parent recap emails").getByRole("button", { name: "Delete", exact: true }).click()
    await expect(dialog(page, "Idea: Parent recap emails").getByRole("button", { name: "Confirm delete" })).toBeVisible()
    await shoot(page, `feature-request-delete-confirm-${theme}`)
    await page.keyboard.press("Escape")

    // Empty board.
    await page.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ requests: [], nextId: 1 })),
      STORAGE_KEY
    )
    await page.reload()
    await expect(page.getByRole("status", { name: "Empty board" })).toBeVisible()
    await shoot(page, `feature-request-empty-${theme}`)

    // Back to the seed for the next run.
    await page.getByRole("button", { name: "Reset", exact: true }).click()
    await expect(page.getByTestId("sample-data-tag")).toHaveCount(10)
  })
}
