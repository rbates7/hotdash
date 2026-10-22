import fs from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { pageOverflowX } from "./support/shell"
import { setTheme } from "./support/theme"

const CAPTURE = Boolean(process.env.SCREENSHOTS)
const OUT = path.resolve(
  process.env.SCREENSHOT_DIR ?? "docs/screenshots/responsive/crm"
)

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`captures copied CRM at ${viewport.width}px (${theme})`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto("/crm")
      await setTheme(page, theme)

      await expect(
        page.getByRole("navigation", { name: "CRM", exact: true })
      ).toBeVisible()
      await expect(
        page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })
      ).toBeVisible()
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      if (CAPTURE) {
        await settleAnimations(page)
        fs.mkdirSync(OUT, { recursive: true })
        await page.screenshot({
          path: path.join(
            OUT,
            `crm-production-${viewport.name}-${theme}.png`
          ),
          fullPage: true,
        })
      }
    })
  }
}
