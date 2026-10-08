import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

/**
 * Review stills for System Status at the four target widths, both themes.
 * Opt-in: `SCREENSHOTS=1 pnpm test:e2e e2e/responsive-system-status-screens.spec.ts`
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

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
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
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
      await expect(banner(page).getByRole("heading", { level: 2, name: "All systems green" })).toBeVisible()
      await shoot(page, `system-status-${size}-green-${theme}`)

      await page.goto("/system-status?preview=not-green")
      await forceTheme(page, theme)
      await expect(banner(page).getByRole("heading", { level: 2, name: "Not green" })).toBeVisible()
      await shoot(page, `system-status-${size}-not-green-${theme}`)

      await page.goto("/system-status?preview=empty")
      await forceTheme(page, theme)
      await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
      await shoot(page, `system-status-${size}-empty-${theme}`)
    })
  }
}
