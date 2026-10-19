import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { setTheme } from "./support/theme"

/**
 * Review screenshots for System Status: the real page (no checks, Not
 * connected), which is the only page — there is no preview control and
 * `?preview=green` is ignored (one shot proves it) — in both themes, at
 * desktop width. The walk and its
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

for (const theme of ["light", "dark"] as const) {
  test(`captures System Status: the real page, and ?preview=green ignored (${theme})`, async ({ page }) => {
    for (const [url, name] of [
      ["/system-status", `system-status-no-key-${theme}`],
      ["/system-status?preview=green", `system-status-preview-green-ignored-${theme}`],
    ] as const) {
      await page.goto(url)
      await setTheme(page, theme)
      await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
      await expect(main(page).locator("header").getByTestId("not-connected")).toBeVisible()
      await expect(main(page).getByTestId("sample-data-tag")).toHaveCount(0)
      await expect(main(page).getByRole("group", { name: "Preview", exact: true })).toHaveCount(0)
      await shoot(page, name)
    }
  })
}
