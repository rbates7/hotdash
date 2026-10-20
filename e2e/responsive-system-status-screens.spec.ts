import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review stills for System Status at the four target widths, both themes:
 * the real page (no checks, Not connected), and the same page at
 * `?preview=green`, which is ignored (no preview route or control). The
 * walk and its assertions run in every e2e run (CI included); the PNGs are
 * written only with
 * `SCREENSHOTS=1 pnpm test:e2e e2e/responsive-system-status-screens.spec.ts`.
 * Nothing is hidden: no nextjs-portal override (a production build has none).
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive/system-status"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
  }
}

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/
  )
}

const banner = (page: Page) =>
  page.getByRole("main").getByRole("region", { name: "Current status", exact: true })

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`System Status ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/system-status")
      await forceTheme(page, theme)
      await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
      await expect(page.getByRole("main").locator("header").getByTestId("not-connected")).toBeVisible()
      await expect(page.getByRole("main").getByRole("group", { name: "Preview", exact: true })).toHaveCount(0)
      await shoot(page, `system-status-${size}-no-key-${theme}`)

      await page.goto("/system-status?preview=green")
      await forceTheme(page, theme)
      await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
      await expect(page.getByRole("main").getByTestId("sample-data-tag")).toHaveCount(0)
      await shoot(page, `system-status-${size}-preview-green-ignored-${theme}`)
    })
  }
}
