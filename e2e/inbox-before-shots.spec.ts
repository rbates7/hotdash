import fs from "node:fs"
import path from "node:path"

import { test, type Page } from "@playwright/test"

import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * "Before" stills of Home and the Workplace Inbox tab on a base branch that
 * has no /api/inbox (how #54's before shots of develop 3f96a83 were made).
 * Self-contained: it imports only support files develop already has, so it
 * can be copied into a worktree of the base, built, and run there:
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/inbox-before-shots.spec.ts
 *
 * Production build, Next portal left visible, nothing mocked.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/inbox-before-shots")
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const
const SURFACES = [
  { name: "home", path: "/home" },
  { name: "inbox", path: "/agent-workplace?tab=inbox" },
] as const

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(300)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const vp of WIDTHS) {
  test(`before at ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp)
    for (const surface of SURFACES) {
      await page.goto(surface.path)
      await waitForHydration(page)
      await page.waitForLoadState("networkidle")
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        await shoot(page, `${surface.name}-before-${vp.width}-${theme}`)
      }
    }
  })
}
