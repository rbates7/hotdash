import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { liveGmailSummary, mockGmail } from "./support/gmail"

/**
 * Review stills for #46: CRM and Settings at four widths, both themes.
 * SHOTS=crm,settings picks pages; GMAIL=connected answers /api/crm/gmail
 * from the fixture inbox (never real mail). The develop "before" set was
 * shot with the same spec minus the Gmail import. Production build,
 * no credentials in the server env.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/crm-settings-shots")
const TAG = process.env.SCREENSHOT_TAG ?? "after"
const PAGES = (process.env.SHOTS ?? "crm,settings").split(",")
const GMAIL = process.env.GMAIL ?? "not-connected"

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
] as const

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await page.waitForTimeout(400)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

async function forceTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t)
    localStorage.removeItem("hotdash.crm.v1")
  }, theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
}

for (const name of PAGES) {
  for (const vp of WIDTHS) {
    for (const theme of ["light", "dark"] as const) {
      test(`${name} ${TAG} ${GMAIL} ${vp.width} ${theme}`, async ({ page }) => {
        await page.setViewportSize(vp)
        if (GMAIL === "connected") {
          await mockGmail(page, liveGmailSummary(Date.now()))
        }
        await page.goto(`/${name}`)
        await forceTheme(page, theme)
        if (name === "settings") {
          await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible()
          // Let the Connected data badges leave "Checking…".
          await expect(page.getByText("Checking…")).toHaveCount(0, { timeout: 15_000 })
          if (GMAIL === "connected") await expect(page.getByTestId("gmail-status")).toHaveText("Connected")
        } else {
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
        }
        const suffix = GMAIL === "connected" ? "-gmail-connected" : ""
        await shoot(page, `${name}-${vp.width}-${theme}-${TAG}${suffix}`)
      })
    }
  }
}
