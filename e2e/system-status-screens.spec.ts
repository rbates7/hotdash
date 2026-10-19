import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for System Status: the real page (no checks, Not
 * connected), the two seeded previews (?preview=green, ?preview=not-green)
 * and the preview toggle, in both themes, at desktop width. The walk and its
 * assertions run in every e2e run (CI included); the PNGs are written only
 * with SCREENSHOTS=1 (`pnpm screens:system-status`, which sets CI so
 * Playwright starts `next start` against the production bundle). Output goes
 * to docs/screenshots/system-status and, when SCREENSHOT_DIR is set, there too.
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/system-status"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string, clip?: Parameters<Page["screenshot"]>[0]) {
  if (!CAPTURE) return
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), ...clip })
  }
}

const main = (page: Page) => page.getByRole("main")
const banner = (page: Page) => main(page).getByRole("region", { name: "Current status", exact: true })
const preview = (page: Page) => main(page).getByRole("group", { name: "Preview", exact: true })

for (const theme of ["light", "dark"] as const) {
  test(`captures every System Status state (${theme})`, async ({ page }) => {
    // The real page: nothing is polled, so no checks and Not connected.
    await page.goto("/system-status")
    await setTheme(page, theme)
    await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
    await expect(main(page).locator("header").getByTestId("not-connected")).toBeVisible()
    await expect(main(page).getByTestId("sample-data-tag")).toHaveCount(0)
    await expect(preview(page).getByRole("link", { name: "Live", exact: true })).toHaveAttribute("aria-current", "page")
    await shoot(page, `system-status-live-${theme}`)

    // The seeded green preview.
    await preview(page).getByRole("link", { name: "Green", exact: true }).click()
    await expect(page).toHaveURL(/preview=green$/)
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await shoot(page, `system-status-green-${theme}`)

    // Tab from Green onto "Not green" so :focus-visible paints (`.focus()`
    // does not). Click first so the next key is a real Tab, not a
    // programmatic focus. Shared settle, not a timeout, before the close-up.
    await preview(page).getByRole("link", { name: "Green", exact: true }).click()
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(preview(page).getByRole("link", { name: "Not green", exact: true })).toBeFocused()
    if (CAPTURE) {
      const header = main(page).locator("header").first()
      await settleAnimations(page)
      for (const dir of OUT_DIRS) {
        fs.mkdirSync(dir, { recursive: true })
        await header.screenshot({ path: path.join(dir, `system-status-preview-toggle-${theme}.png`) })
      }
    }

    await preview(page).getByRole("link", { name: "Not green", exact: true }).click()
    await expect(page).toHaveURL(/preview=not-green$/)
    await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
    await shoot(page, `system-status-not-green-${theme}`)

    // Back to the real page.
    await preview(page).getByRole("link", { name: "Live", exact: true }).click()
    await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
  })
}
