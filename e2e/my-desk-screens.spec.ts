import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { EMPTY_COPY, FINISHED_EARLIER_COPY, SCRATCH_PLACEHOLDER } from "../src/components/my-desk/my-desk-screen"
import { addDays, now, todayIn } from "../src/lib/clock"
import { carryFromLabel } from "../src/lib/my-desk"
import { settleAnimations } from "./support/contrast"
import { CLEAR_CONFIRM_NAME, NOTE, clearMyEntries, persistenceNote } from "./support/persistence"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for My Desk, every main state in both themes at
 * desktop width. The walk and its assertions run in every e2e run (CI
 * included); the PNGs are written only with SCREENSHOTS=1
 * (`pnpm screens:my-desk`). Output goes to docs/screenshots/my-desk and,
 * when SCREENSHOT_DIR is set, there as well.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/my-desk"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.my-desk.v2"

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const todayList = (page: Page) => page.getByRole("region", { name: "Today list", exact: true })
const notes = (page: Page) => page.getByRole("region", { name: "Notes", exact: true })
const empty = (page: Page) => page.getByRole("status", { name: "No to-dos", exact: true })
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

async function freshDesk(page: Page, theme: "light" | "dark") {
  await page.goto("/my-desk")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await setTheme(page, theme)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await expect(todayList(page).locator("[data-todo]")).toHaveCount(0)
  await expect(empty(page)).toContainText(EMPTY_COPY)
  await expect(notes(page).getByLabel("Scratch")).toHaveValue("")
  await expect(notes(page).getByLabel("Scratch")).toHaveAttribute("placeholder", SCRATCH_PLACEHOLDER)
  await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
}

async function addTodo(page: Page, title: string, note: string) {
  await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
  const add = dialog(page, "Add to-do")
  await add.getByLabel("Title").fill(title)
  await add.getByLabel("Note").fill(note)
  await add.getByRole("button", { name: "Add to-do", exact: true }).click()
  await expect(add).toBeHidden()
  await expect(todayList(page).getByRole("checkbox", { name: title, exact: true })).toBeVisible()
}

for (const theme of ["light", "dark"] as const) {
  test(`captures every My Desk state (${theme})`, async ({ page }) => {
    // Loading skeleton — provider holds hydration so the empty desk never flashes.
    await page.goto("/my-desk?shot=loading")
    await setTheme(page, theme)
    await expect(page.getByRole("status", { name: "Loading saved desk", exact: true })).toBeVisible()
    await shoot(page, `my-desk-loading-${theme}`)

    await freshDesk(page, theme)
    await shoot(page, `my-desk-fresh-${theme}`)

    await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
    const add = dialog(page, "Add to-do")
    await add.getByLabel("Title").fill("Walk the dog")
    await add.getByLabel("Note").fill("after clinic")
    await expect(add.getByRole("button", { name: "Add to-do", exact: true })).toBeEnabled()
    await shoot(page, `my-desk-add-${theme}`)
    await add.getByRole("button", { name: "Add to-do", exact: true }).click()
    await expect(add).toBeHidden()
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)

    await addTodo(page, "Call the AD", "Friday walk-through")
    await addTodo(page, "Order cones", "two dozen")
    await todayList(page).getByRole("checkbox", { name: "Order cones", exact: true }).click()
    await expect(todayList(page).getByRole("checkbox", { name: "Order cones", exact: true })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(3)
    await expect(page.getByTestId("open-count")).toHaveText("2")
    await shoot(page, `my-desk-with-entries-${theme}`)

    await todayList(page).getByRole("button", { name: "Edit Walk the dog", exact: true }).click()
    const edit = dialog(page, "Edit to-do")
    await expect(edit.getByLabel("Title")).toHaveValue("Walk the dog")
    await shoot(page, `my-desk-edit-${theme}`)
    await page.keyboard.press("Escape")
    await expect(edit).toBeHidden()

    await todayList(page).getByRole("button", { name: "Delete Walk the dog", exact: true }).click()
    await expect(dialog(page, "Delete this to-do?")).toContainText("Walk the dog")
    await shoot(page, `my-desk-delete-confirm-${theme}`)
    await dialog(page, "Delete this to-do?").getByRole("button", { name: "Keep it", exact: true }).click()
    await expect(dialog(page, "Delete this to-do?")).toBeHidden()

    const scratch = notes(page).getByLabel("Scratch")
    await scratch.fill("Packet before Friday — keep this off Workplace.\n\nPersonal only.")
    await scratch.blur()
    await expect(page.getByTestId("scratch-status")).toContainText("Saved")
    await scratch.focus()
    await shoot(page, `my-desk-scratch-saved-${theme}`)

    await clearButton(page).click()
    const clear = dialog(page, CLEAR_CONFIRM_NAME)
    await expect(clear).toContainText("There is no server copy to recover from.")
    await expect(clear.getByRole("button", { name: "Clear", exact: true })).toBeVisible()
    await shoot(page, `my-desk-clear-confirm-${theme}`)
    await clear.getByRole("button", { name: "Keep my edits", exact: true }).click()
    await expect(clear).toBeHidden()
    await expect(todayList(page).locator("[data-todo]")).toHaveCount(3)

    for (const title of ["Walk the dog", "Call the AD", "Order cones"]) {
      await todayList(page).getByRole("button", { name: `Delete ${title}`, exact: true }).click()
      await dialog(page, "Delete this to-do?").getByRole("button", { name: "Delete", exact: true }).click()
      await expect(dialog(page, "Delete this to-do?")).toBeHidden()
    }
    await notes(page).getByLabel("Scratch").fill("")
    await notes(page).getByLabel("Scratch").blur()
    await expect(empty(page)).toContainText(EMPTY_COPY)
    await expect(notes(page).getByLabel("Scratch")).toHaveValue("")
    await expect(page.getByRole("status", { name: "To-do removed", exact: true })).toContainText("Order cones")
    await shoot(page, `my-desk-empty-${theme}`)

    await clearMyEntries(page, header(page))
    await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
    await expect(empty(page)).toContainText(EMPTY_COPY)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()

    await page.goto("/my-desk?shot=error")
    await setTheme(page, theme)
    await expect(page.getByRole("heading", { name: "My Desk couldn’t render" })).toBeVisible()
    await shoot(page, `my-desk-error-${theme}`)
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`captures a carried-over row next to today's items (${theme})`, async ({ page }) => {
    const today = todayIn(now())
    const yesterday = addDays(today, -1)
    const label = carryFromLabel(yesterday, today)
    await page.goto("/my-desk")
    await page.evaluate(
      ([key, day, prior]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            todos: [
              {
                id: "todo-20",
                title: "Finish the packet",
                note: "Aledo",
                done: false,
                createdOn: prior,
                doneOn: null,
              },
              {
                id: "todo-21",
                title: "Already filed",
                note: "",
                done: true,
                createdOn: prior,
                doneOn: prior,
              },
              {
                id: "todo-22",
                title: "Call today",
                note: "on the list with the carry-over",
                done: false,
                createdOn: day,
                doneOn: null,
              },
            ],
            nextId: 23,
            scratch: "Keep this off Workplace. Personal only.",
            scratchUpdatedAt: new Date().toISOString(),
          })
        )
      },
      [STORAGE_KEY, today, yesterday] as const
    )
    await page.reload()
    await setTheme(page, theme)
    await expect(persistenceNote(page)).toHaveText(NOTE.saved)
    await expect(todayList(page).getByRole("checkbox", { name: "Finish the packet", exact: true })).toBeVisible()
    await expect(todayList(page).getByTestId("carry-from")).toContainText(label ?? "")
    await expect(todayList(page).getByRole("checkbox", { name: "Call today", exact: true })).toBeVisible()
    await expect(todayList(page).getByRole("checkbox", { name: "Already filed", exact: true })).toHaveCount(0)
    await expect(notes(page).getByLabel("Scratch")).toHaveValue("Keep this off Workplace. Personal only.")
    await shoot(page, `my-desk-carryover-${theme}`)
  })
}

for (const theme of ["light", "dark"] as const) {
  test(`captures the finished-earlier empty state (${theme})`, async ({ page }) => {
    const today = todayIn(now())
    const yesterday = addDays(today, -1)
    await page.goto("/my-desk")
    await page.evaluate(
      ([key, prior]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            todos: [
              {
                id: "todo-21",
                title: "Already filed",
                note: "yesterday",
                done: true,
                createdOn: prior,
                doneOn: prior,
              },
            ],
            nextId: 22,
            scratch: "",
            scratchUpdatedAt: new Date().toISOString(),
          })
        )
      },
      [STORAGE_KEY, yesterday] as const
    )
    await page.reload()
    await setTheme(page, theme)
    await expect(empty(page)).toContainText(FINISHED_EARLIER_COPY)
    await expect(clearButton(page)).toBeEnabled()
    await shoot(page, `my-desk-finished-earlier-${theme}`)
  })
}
