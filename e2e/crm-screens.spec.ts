import fs from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { setTheme } from "./support/theme"

const CAPTURE = Boolean(process.env.SCREENSHOTS)
const OUT = path.resolve(
  process.env.SCREENSHOT_DIR ?? "docs/screenshots/crm"
)

for (const theme of ["light", "dark"] as const) {
  test(`captures the copied CRM shell and durable-data state (${theme})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/crm")
    await setTheme(page, theme)

    await expect(
      page.getByRole("navigation", { name: "CRM", exact: true })
    ).toBeVisible()
    await expect(
      page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })
    ).toBeVisible()

    if (CAPTURE) {
      await settleAnimations(page)
      fs.mkdirSync(OUT, { recursive: true })
      await page.screenshot({
        path: path.join(OUT, `crm-production-${theme}.png`),
        fullPage: true,
      })
    }
  })
}
