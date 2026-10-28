import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { vetUnmockedApi, writeShotShas } from "./support/shots"
import { setTheme } from "./support/theme"

/**
 * Review stills for Accounts against a production build with no keys:
 * the real server's Not connected state at 1440 and 390, in light and
 * dark, and the search empty state. That one needs the screen live, so
 * `/api/crm/accounts` answers connected with no rows at all (no sample
 * data); every other /api call is vetted for live data.
 *
 *   pnpm build && CI=true SCREENSHOTS=1 SCREENSHOT_DIR=… playwright test e2e/crm-accounts-screens.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture")

const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "test-results/crm-accounts-shots")

async function shoot(page: Page, name: string) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined)
  await settleAnimations(page)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
}

test.beforeAll(() => writeShotShas(OUT, "CRM Accounts"))

for (const theme of ["light", "dark"] as const) {
  const suffix = theme === "light" ? "" : "-dark"

  test(`Not connected at 1440 (${theme})`, async ({ page }) => {
    const check = await vetUnmockedApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/crm/accounts")
    await setTheme(page, theme)
    await expect(page.getByTestId("accounts-not-connected")).toBeVisible()
    await shoot(page, `accounts-desktop-1440${suffix}.png`)
    check()
  })

  test(`Not connected at 390 (${theme})`, async ({ page }) => {
    const check = await vetUnmockedApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/crm/accounts")
    await setTheme(page, theme)
    await expect(page.getByTestId("accounts-not-connected")).toBeVisible()
    await shoot(page, `accounts-phone-390${suffix}.png`)
    check()
  })

  test(`search with no match at 1440 (${theme})`, async ({ page }) => {
    const check = await vetUnmockedApi(page)
    await page.route("**/api/crm/accounts", (route) =>
      route.fulfill({
        json: { status: "connected", missing: [], lastSyncedAt: new Date().toISOString(), lastTriedAt: null, stripeContacts: 0, orgs: [], noOrgUsers: [] },
      })
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto("/crm/accounts")
    await setTheme(page, theme)
    await page.getByRole("searchbox", { name: "Search organizations or users" }).fill("zephyr academy")
    await expect(page.getByTestId("accounts-no-results")).toBeVisible()
    await shoot(page, `accounts-search-empty-1440${suffix}.png`)
    check()
  })
}
