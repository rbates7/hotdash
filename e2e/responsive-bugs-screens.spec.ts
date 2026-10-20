import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { EMPTY_BUGS, EMPTY_BUGS_HINT, freshBugs, seededBugs } from "./support/bugs"
import { settleAnimations } from "./support/contrast"
import { liveInbox, mockInbox } from "./support/inbox"
import { waitForHydration } from "./support/shell"
import { vetUnmockedApi, writeShotShas } from "./support/shots"
import { setTheme } from "./support/theme"

/**
 * Review stills for Bugs at the four target widths, both themes. The walk
 * and its assertions run in every e2e run (CI included); the PNGs are
 * written only with SCREENSHOTS=1: `pnpm screens:responsive-bugs`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-bugs-screens.spec.ts`).
 * The Next portal is left visible.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/bugs"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

test.beforeAll(() => {
  if (CAPTURE) for (const dir of OUT_DIRS) writeShotShas(dir, "responsive bugs stills")
})

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })

/**
 * Every open bug of the founder's moved to Done through the ticket, as
 * e2e/bugs.spec.ts does. At desktop width (the ticket's own responsive
 * work is a separate PR), then back to `viewport`.
 */
async function fixEveryBug(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(SIZES.desktop)
  for (const [key, from] of [
    ["CHLK-919", "To Do"],
    ["CHLK-904", "In Progress"],
    ["CHLK-920", "In Review"],
  ] as const) {
    await page.goto(`/bugs?issue=${key}`)
    await props(page).getByRole("button", { name: from, exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(props(page).getByRole("button", { name: "Done", exact: true })).toBeVisible()
  }
  await page.setViewportSize(viewport)
  await page.goto("/bugs")
  await waitForHydration(page)
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Bugs ${size} ${theme}`, async ({ page }) => {
      const noLiveData = CAPTURE ? await vetUnmockedApi(page) : () => undefined
      await page.setViewportSize(viewport)

      // Nothing connected, nothing saved: Sentry Not connected, empty list.
      await freshBugs(page)
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(page.getByTestId("sentry-not-connected")).toBeVisible()
      await expect(list(page).getByTestId("empty-bugs-hint")).toHaveText(EMPTY_BUGS_HINT)
      await shoot(page, `bugs-${size}-not-connected-${theme}`)

      // The founder's own bug tickets, from a saved Workplace copy.
      await seededBugs(page)
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
      await expect(list(page).getByRole("link")).toHaveCount(4)
      await shoot(page, `bugs-${size}-with-data-${theme}`)

      await page.goto("/bugs?issue=CHLK-919")
      await waitForHydration(page)
      await expect(
        page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })
      ).toBeVisible()
      await setTheme(page, theme)
      await shoot(page, `bugs-${size}-ticket-${theme}`)

      // Every bug fixed: "No open bugs" with the fixed ones listed.
      await fixEveryBug(page, viewport)
      await expect(list(page).getByRole("status", { name: "Empty bug list" })).toHaveText(EMPTY_BUGS)
      await expect(list(page).getByText("0 open · 4 fixed")).toBeVisible()
      await setTheme(page, theme)
      await shoot(page, `bugs-${size}-all-fixed-${theme}`)
      noLiveData()
    })

    test(`Bugs ${size} Sentry connected ${theme}`, async ({ page }) => {
      const noLiveData = CAPTURE ? await vetUnmockedApi(page) : () => undefined
      await mockInbox(page, liveInbox(Date.now()))
      await page.setViewportSize(viewport)
      await seededBugs(page)
      await waitForHydration(page)
      await setTheme(page, theme)
      await expect(page.getByTestId("sentry-crashes")).toHaveAttribute("data-state", "connected")
      await expect(page.getByTestId("sentry-crashes").getByRole("link")).toHaveCount(3)
      await expect(list(page).getByRole("link")).toHaveCount(4)
      await shoot(page, `bugs-${size}-sentry-live-${theme}`)
      noLiveData()
    })
  }
}
