import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { setTheme } from "./support/theme"
import { expandSidebarButton, founderNavDrawer, openFounderNav } from "./support/nav"

/**
 * Shell stills at the four target widths, both themes, plus phone/tablet overlays.
 * Opt-in: `SCREENSHOTS=1 pnpm test:e2e e2e/responsive-shell-screens.spec.ts`
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT_DIRS = [
  path.resolve("docs/screenshots/responsive-shell"),
  path.resolve("artifacts/responsive-shell"),
  ...(process.env.SCREENSHOT_DIR ? [path.resolve(process.env.SCREENSHOT_DIR)] : []),
]

const SIZES = {
  phone: { width: 390, height: 844 },
  "tablet-portrait": { width: 820, height: 1180 },
  "tablet-landscape": { width: 1180, height: 820 },
  desktop: { width: 1440, height: 900 },
} as const

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(250)
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true })
    await page.screenshot({ path: path.join(dir, `${name}.png`) })
  }
}

for (const theme of ["light", "dark"] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`shell ${size} ${theme}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto("/home")
      await page.evaluate(() => localStorage.setItem("theme", "light"))
      await page.reload()
      await setTheme(page, theme)
      await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible()
      await shoot(page, `shell-${size}-${theme}`)
      if (size === "phone") {
        await openFounderNav(page)
        await shoot(page, `shell-${size}-drawer-${theme}`)
      }
      if (size === "tablet-portrait") {
        await expandSidebarButton(page).click()
        await expect(founderNavDrawer(page)).toBeVisible()
        await shoot(page, `shell-${size}-drawer-${theme}`)
      }
    })
  }
}
