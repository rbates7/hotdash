import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { CRM_STORAGE_KEY as STORAGE_KEY, expectGmailPanel, gmailPanel } from "./support/crm"
import { liveGmailSummary, mockGmail } from "./support/gmail"
import { waitForHydration } from "./support/shell"
import { setTheme } from "./support/theme"

/**
 * Review stills for the CRM's Gmail source: not connected (the real server
 * with no credentials — the Not connected panel, no rows) and connected (a
 * mocked /api/crm/gmail with the fixture inbox, never real mail), at four
 * widths in both themes — 16 PNGs. The states and their assertions run in
 * every e2e run; the PNGs are written only with SCREENSHOTS=1, against a
 * production build so the dev badge is absent:
 *
 *   pnpm build && SCREENSHOT_DIR=… pnpm screens:crm-gmail
 */
const CAPTURE = Boolean(process.env.SCREENSHOTS)

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/crm-gmail-shots")

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

const source = (page: Page) => page.getByRole("main").locator("header").first().getByTestId("crm-source")

async function shoot(page: Page, name: string) {
  if (!CAPTURE) return
  await settleAnimations(page)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

for (const state of ["not-connected", "connected"] as const) {
  for (const vp of WIDTHS) {
    for (const theme of ["light", "dark"] as const) {
      test(`CRM overview, Gmail ${state}, ${vp.width} ${theme}`, async ({ page }) => {
        await page.setViewportSize(vp)
        if (state === "connected") await mockGmail(page, liveGmailSummary(Date.now()))
        await page.goto("/crm")
        await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
        await page.reload()
        await waitForHydration(page)
        await setTheme(page, theme)
        if (state === "connected") {
          await expect(source(page)).toHaveText("Live from Gmail")
          await expect(page.getByText("3 contacts · 3 open conversations")).toBeVisible()
          await expect(gmailPanel(page)).toHaveCount(0)
        } else {
          await expect(source(page)).toHaveText("Gmail not connected")
          await expectGmailPanel(page, "overview")
          await expect(page.getByText(/open conversations/)).toHaveCount(0)
        }
        await expect(page.getByTestId("sample-data-tag")).toHaveCount(0)
        await shoot(page, `crm-gmail-${state}-${vp.width}-${theme}`)
      })
    }
  }
}
