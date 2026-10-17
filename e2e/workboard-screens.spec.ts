import fs from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

/**
 * Review still of `GET /api/workboard` as the browser shows it (not
 * connected: the test server has no GitHub token). Opt-in:
 *
 *   SCREENSHOTS=1 SCREENSHOT_DIR=… pnpm exec playwright test e2e/workboard-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "screenshots/workboard")

test("workboard api (after)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const res = await page.goto("/api/workboard")
  expect(res?.status()).toBe(200)
  await expect(page.locator("body")).toContainText('"connected"')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, "workboard-api-after.png"), await page.screenshot({ fullPage: true }))
})
