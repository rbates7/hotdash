import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { EMPTY_COPY, FINISHED_EARLIER_COPY, SCRATCH_PLACEHOLDER } from "../src/components/my-desk/my-desk-screen"
import { addDays, now, todayIn } from "../src/lib/clock"
import { carryFromLabel } from "../src/lib/my-desk"
import { settleAnimations } from "./support/contrast"
import { CLEAR_CONFIRM_NAME, NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for My Desk at the four target widths, both themes. The
 * walk and its assertions run in every e2e run (CI included); the PNGs are
 * written only with SCREENSHOTS=1, against a production build so the
 * Next.js dev “N” badge is absent:
 * `CI=true SCREENSHOTS=1 playwright test e2e/responsive-my-desk-screens.spec.ts`
 * (or `pnpm screens:responsive-my-desk`). Nothing is hidden: no
 * nextjs-portal override.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/my-desk"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const STORAGE_KEY = "hotdash.my-desk.v2"

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
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage })
  }
}

const header = (page: Page) => page.getByRole("main").locator("header").first()
const todayList = (page: Page) => page.getByRole("region", { name: "Today list", exact: true })
const notes = (page: Page) => page.getByRole("region", { name: "Notes", exact: true })
const empty = (page: Page) => page.getByRole("status", { name: "No to-dos", exact: true })
const clearButton = (page: Page) => header(page).getByRole("button", { name: "Clear my entries", exact: true })
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true })

/** The founder's own rows, as a copy saved earlier: two open, one done today. */
const FIRST = "Call the AD"

function userDesk(day: string) {
  return {
    todos: [
      { id: "todo-8", title: FIRST, note: "Friday walk-through", done: false, createdOn: day, doneOn: null },
      { id: "todo-9", title: "Book the clinic room", note: "Houston — Saturday", done: false, createdOn: day, doneOn: null },
      { id: "todo-10", title: "Send the packet", note: "11-personnel", done: true, createdOn: day, doneOn: day },
    ],
    nextId: 11,
    scratch: "",
    scratchUpdatedAt: new Date().toISOString(),
  }
}

async function closeAll(page: Page) {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape")
    await settleAnimations(page)
  }
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

async function open(page: Page, theme: "light" | "dark", state: unknown) {
  await page.goto("/my-desk")
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
    test(`My Desk ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      const phone = size === "phone"
      const desktop = size === "desktop"
      const today = todayIn(now())

      await page.goto("/my-desk?shot=loading")
      await setTheme(page, theme)
      await expect(page.getByRole("status", { name: "Loading saved desk", exact: true })).toBeVisible()
      await shoot(page, `my-desk-${size}-loading-${theme}`)

      // A fresh desk: nothing saved, nothing invented.
      await open(page, theme, null)
      await expect(todayList(page).locator("[data-todo]")).toHaveCount(0)
      await expect(empty(page)).toContainText(EMPTY_COPY)
      await expect(notes(page).getByLabel("Scratch")).toHaveValue("")
      await expect(notes(page).getByLabel("Scratch")).toHaveAttribute("placeholder", SCRATCH_PLACEHOLDER)
      await expect(clearButton(page)).toHaveAttribute("aria-disabled", "true")
      await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
      await shoot(page, `my-desk-${size}-empty-${theme}`)

      await open(page, theme, userDesk(today))
      await expect(todayList(page).locator("[data-todo]")).toHaveCount(3)
      await expect(clearButton(page)).toBeEnabled()
      await shoot(page, `my-desk-${size}-with-data-${theme}`)

      if (phone) {
        await todayList(page).getByRole("button", { name: `Open ${FIRST}`, exact: true }).click()
        const sheet = dialog(page, FIRST)
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeVisible()
        await shoot(page, `my-desk-${size}-sheet-${theme}`, { fullPage: false })
        await sheet.getByRole("group", { name: "To-do actions" }).getByRole("button", { name: "Edit" }).click()
      } else {
        await todayList(page).getByRole("button", { name: `Edit ${FIRST}`, exact: true }).click()
      }
      await expect(dialog(page, "Edit to-do")).toBeVisible()
      await expect(dialog(page, "Edit to-do").getByLabel("Title")).toHaveValue(FIRST)
      await shoot(page, `my-desk-${size}-edit-${theme}`, { fullPage: desktop })
      await closeAll(page)

      if (!desktop) {
        await header(page).getByRole("button", { name: "Add to-do", exact: true }).click()
        await expect(dialog(page, "Add to-do")).toBeVisible()
        await shoot(page, `my-desk-${size}-dialog-add-${theme}`, { fullPage: false })
        await closeAll(page)

        if (phone) {
          await todayList(page).getByRole("button", { name: `Open ${FIRST}`, exact: true }).click()
          await dialog(page, FIRST)
            .getByRole("group", { name: "To-do actions" })
            .getByRole("button", { name: "Delete" })
            .click()
        } else {
          await todayList(page).getByRole("button", { name: `Delete ${FIRST}`, exact: true }).click()
        }
        await expect(dialog(page, "Delete this to-do?")).toContainText(FIRST)
        await shoot(page, `my-desk-${size}-dialog-delete-${theme}`, { fullPage: false })
        await closeAll(page)

        await clearButton(page).click()
        await expect(dialog(page, CLEAR_CONFIRM_NAME)).toBeVisible()
        await shoot(page, `my-desk-${size}-dialog-clear-${theme}`, { fullPage: false })
        await closeAll(page)
      }
      await expect(todayList(page).locator("[data-todo]")).toHaveCount(3)

      const scratch = notes(page).getByLabel("Scratch")
      await scratch.fill("Packet before Friday — keep this off Workplace.\n\nPersonal only.")
      await scratch.blur()
      await expect(page.getByTestId("scratch-status")).toContainText("Saved")
      await shoot(page, `my-desk-${size}-scratch-saved-${theme}`)

      const yesterday = addDays(today, -1)
      const label = carryFromLabel(yesterday, today)
      await open(page, theme, {
        todos: [
          {
            id: "todo-20",
            title: "Finish the packet",
            note: "Aledo",
            done: false,
            createdOn: yesterday,
            doneOn: null,
          },
          {
            id: "todo-22",
            title: "Call today",
            note: "on the list with the carry-over",
            done: false,
            createdOn: today,
            doneOn: null,
          },
        ],
        nextId: 23,
        scratch: "Keep this off Workplace. Personal only.",
        scratchUpdatedAt: new Date().toISOString(),
      })
      await expect(todayList(page).getByTestId("carry-from")).toContainText(label ?? "")
      await shoot(page, `my-desk-${size}-carryover-${theme}`)

      await open(page, theme, {
        todos: [
          {
            id: "todo-21",
            title: "Already filed",
            note: "yesterday",
            done: true,
            createdOn: yesterday,
            doneOn: yesterday,
          },
        ],
        nextId: 22,
        scratch: "",
        scratchUpdatedAt: new Date().toISOString(),
      })
      await expect(empty(page)).toContainText(FINISHED_EARLIER_COPY)
      await shoot(page, `my-desk-${size}-finished-earlier-${theme}`)
    })
  }
}
