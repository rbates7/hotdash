import fs from "node:fs"
import path from "node:path"

import { test } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/** CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/settings-connected-data-screens.spec.ts */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/settings-connected-data")
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

for (const theme of ["light", "dark"] as const) {
  for (const size of WIDTHS) {
    test(`connected data ${theme} ${size.width}`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto("/settings")
      await waitForHydration(page)
      await setTheme(page, theme)
      const section = page.locator("#connected-data")
      await section.scrollIntoViewIfNeeded()
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
      await page.waitForTimeout(300)
      fs.mkdirSync(OUT, { recursive: true })
      await section.screenshot({ path: path.join(OUT, `connected-data-${size.width}-${theme}.png`) })
    })
  }
}
