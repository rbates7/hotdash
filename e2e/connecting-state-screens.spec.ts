import fs from "node:fs"
import path from "node:path"

import { test, type Page } from "@playwright/test"

import { connectingSummary } from "../src/test/stripe-fixture"
import { waitForHydration } from "./support/shell"
import { mockStripe } from "./support/stripe"
import { setTheme } from "./support/theme"

/**
 * Review stills for the connecting state (a key, first sync still running),
 * against a production build so the dev badge is absent. The summary is
 * mocked as `connecting`; a build without the state reads that as not
 * connected, which is what a fresh server showed before (the "before" set).
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/connecting-state-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/connecting-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

async function shoot(page: Page, route: string, name: string, vp: { width: number; height: number }, theme: "light" | "dark") {
  await page.setViewportSize(vp)
  await mockStripe(page, connectingSummary())
  await page.goto(route)
  await waitForHydration(page)
  await setTheme(page, theme)
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(500)
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `${name}-${vp.width}-${theme}.png`), await page.screenshot({ fullPage: true }))
}

for (const vp of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`home ${vp.width} ${theme}`, async ({ page }) => shoot(page, "/home", "home", vp, theme))
    test(`metrics ${vp.width} ${theme}`, async ({ page }) => shoot(page, "/metrics", "metrics", vp, theme))
    test(`settings ${vp.width} ${theme}`, async ({ page }) => shoot(page, "/settings", "settings", vp, theme))
  }
}
