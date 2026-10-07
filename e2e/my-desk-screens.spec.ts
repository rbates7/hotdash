import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote, resetDemoData } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for My Desk, every main state in both themes at
 * desktop width. Opt-in: `SCREENSHOTS=1` (or `pnpm screens:my-desk`).
 * Output goes to docs/screenshots/my-desk and, when SCREENSHOT_DIR is set,
 * there as well.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/my-desk"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.my-desk.v1"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const todayList = (page: Page) => page.getByRole("region", { name: "Today list", exact: true })
const notes = (page: Page) => page.getByRole("region", { name: "Notes", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function freshSeeded(page: Page, theme: "light" | "dark") {
  await page.goto("/my-desk")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await setTheme(page, theme)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every My Desk state (${theme})`, async ({ page }) => {
    // Loading skeleton — provider holds hydration so the seed never flashes.
    await page.goto("/my-desk?shot=loading")
    await setTheme(page, theme)
    await expect(page.getByRole("status", { name: "Loading saved desk", exact: true })).toBeVisible()
    await shoot(page, `my-desk-loading-${theme}`)

    await freshSeeded(page, theme)
    await shoot(page, `my-desk-seeded-${theme}`)

    await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
    const add = dialog(page, "Add to-do")
    await add.getByLabel("Title").fill("Walk the dog")
    await add.getByLabel("Note").fill("after clinic")
    await shoot(page, `my-desk-add-${theme}`)
    await add.getByRole("button", { name: "Add to-do", exact: true }).click()
    await expect(add).toBeHidden()

    await todayList(page).getByRole("button", { name: "Edit Walk the dog", exact: true }).click()
    const edit = dialog(page, "Edit to-do")
    await expect(edit.getByLabel("Title")).toHaveValue("Walk the dog")
    await shoot(page, `my-desk-edit-${theme}`)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()

    await todayList(page).getByRole("button", { name: "Delete Walk the dog", exact: true }).click()
    await expect(dialog(page, "Delete this to-do?")).toBeVisible()
    await shoot(page, `my-desk-delete-confirm-${theme}`)
    await dialog(page, "Delete this to-do?").getByRole("button", { name: "Keep it", exact: true }).click()

    const scratch = notes(page).getByLabel("Scratch")
    await scratch.fill("Aledo packet — keep this off Workplace.\n\nPersonal only.")
    await scratch.blur()
    await expect(page.getByTestId("scratch-status")).toContainText("Saved")
    await scratch.focus()
    await shoot(page, `my-desk-scratch-saved-${theme}`)

    await header(page).getByRole("button", { name: "Reset", exact: true }).click()
    await expect(dialog(page, "Reset demo data?")).toBeVisible()
    await shoot(page, `my-desk-reset-confirm-${theme}`)
    await dialog(page, "Reset demo data?").getByRole("button", { name: "Keep my edits", exact: true }).click()

    for (const title of [
      "Walk the dog",
      "Call Aledo",
      "Clinic follow-up",
      "Look at Metrics",
      "Reply to Dan",
      "Text May — Dallas night",
      "Confirm Austin flight",
      "Sketch Aledo install notes",
    ]) {
      await todayList(page).getByRole("button", { name: `Delete ${title}`, exact: true }).click()
      await dialog(page, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this to-do?")).toBeHidden()
    }
    await notes(page).getByLabel("Scratch").fill("")
    await notes(page).getByLabel("Scratch").blur()
    await expect(page.getByRole("status", { name: "No to-dos", exact: true })).toBeVisible()
    await expect(notes(page).getByLabel("Scratch")).toHaveValue("")
    await shoot(page, `my-desk-empty-${theme}`)

    await resetDemoData(page, header(page))
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(7)

    await page.goto("/my-desk?shot=error")
    await setTheme(page, theme)
    await expect(page.getByRole("heading", { name: "My Desk couldn’t render" })).toBeVisible()
    await shoot(page, `my-desk-error-${theme}`)
  })
}
