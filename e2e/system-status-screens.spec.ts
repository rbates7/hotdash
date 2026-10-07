import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { setTheme } from "./support/theme"

/**
 * Review screenshots for System Status: both seeded states and the preview
 * toggle, in both themes, at desktop width. Opt-in: `pnpm screens:system-status`
 * (or `SCREENSHOTS=1`). That script sets CI so Playwright starts `next start`
 * against the production bundle — same as the smoke — and never reuses a
 * leftover `next dev` (whose "N" badge sat on Logout). Output goes to
 * docs/screenshots/system-status and, when SCREENSHOT_DIR is set, there too.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/system-status"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

test.use({ viewport: { width: 1440, height: 900 } })

async function shoot(page: Page, name: string, clip?: Parameters<Page["screenshot"]>[0]) {
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
    await page.goto("/system-status")
    await setTheme(page, theme)
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
    await shoot(page, `system-status-green-${theme}`)

    // Tab from Green onto "Not green" so the focus ring paints (`.focus()`
    // does not). Shared settle, not a timeout, before the close-up.
    await preview(page).getByRole("link", { name: "Green", exact: true }).press("Tab")
    const header = main(page).locator("header").first()
    await settleAnimations(page)
    for (const dir of OUT_DIRS) {
      await header.screenshot({ path: path.join(dir, `system-status-preview-toggle-${theme}.png`) })
    }

    await preview(page).getByRole("link", { name: "Not green", exact: true }).click()
    await expect(page).toHaveURL(/preview=not-green$/)
    await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
    await shoot(page, `system-status-not-green-${theme}`)

    // Cheap extra: the zero-checks state (URL preview, same as not-green).
    await page.goto("/system-status?preview=empty")
    await setTheme(page, theme)
    await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
    await shoot(page, `system-status-empty-${theme}`)

    // Back to green for the next run.
    await preview(page).getByRole("link", { name: "Green", exact: true }).click()
    await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
  })
}
