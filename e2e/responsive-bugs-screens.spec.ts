import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { NOTE, persistenceNote } from "./support/persistence"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for Bugs at the four target widths, both themes.
 * Opt-in: `pnpm screens:responsive-bugs`
 * (`CI=true SCREENSHOTS=1 playwright test e2e/responsive-bugs-screens.spec.ts`).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/bugs"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

/** Bugs has no key of its own: it reads and writes the Workplace's. */
const STORAGE_KEY = "hotdash.agent-workplace.v2"

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

const list = (page: Page) => page.getByRole("region", { name: "Bug list", exact: true })
const props = (page: Page) => page.getByRole("complementary", { name: "Ticket properties" })

/** Load `path` with the seed (no saved copy) and the theme applied. */
async function open(page: Page, theme: "light" | "dark", target = "/bugs") {
  await page.goto("/bugs")
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.goto(target)
  await waitForHydration(page)
  await expect(persistenceNote(page)).toHaveText(NOTE.unsaved)
  await setTheme(page, theme)
}

/** Every open bug moved to Done through the ticket, as e2e/bugs.spec.ts does. */
async function emptyBugs(page: Page) {
  for (const [key, from] of [
    ["CHLK-419", "To Do"],
    ["CHLK-404", "In Progress"],
    ["CHLK-420", "In Review"],
  ] as const) {
    await page.goto(`/bugs?issue=${key}`)
    await props(page).getByRole("button", { name: from, exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click()
    await page.keyboard.press("Escape")
    await expect(props(page).getByRole("button", { name: "Done", exact: true })).toBeVisible()
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`Bugs ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)

      await open(page, theme)
      await expect(list(page).getByText("3 open · 1 fixed")).toBeVisible()
      await shoot(page, `bugs-${size}-with-data-${theme}`)

      await open(page, theme, "/bugs?issue=CHLK-419")
      await expect(
        page.getByRole("heading", { level: 1, name: "Crash opening a shared playbook on iPad" })
      ).toBeVisible()
      await shoot(page, `bugs-${size}-ticket-${theme}`)

      // Empty: seeded at desktop width (the ticket's own responsive work is
      // a separate PR), then shot at this size.
      await page.setViewportSize(SIZES.desktop)
      await open(page, theme)
      await emptyBugs(page)
      await page.setViewportSize(viewport)
      await page.goto("/bugs")
      await waitForHydration(page)
      await expect(list(page).getByRole("status", { name: "Empty bug list" })).toHaveText("No open bugs")
      await setTheme(page, theme)
      await shoot(page, `bugs-${size}-empty-${theme}`)
    })
  }
}
