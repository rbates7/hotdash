import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { settleAnimations } from "./support/contrast"
import { vetUnmockedApi } from "./support/shots"

/**
 * Triage stills for the bulk-select change, desktop 1440 and phone 390,
 * written to SHOT_DIR when SCREENSHOTS=1. Run the way `screens:crm` is
 * (CI=true starts a key-less production server). That server has no CRM
 * database, so the default still is the durable-data error; the selection
 * still needs Triage rows and is skipped without them (stills must never
 * show live data, so it never runs against a database-backed server either).
 */

const CAPTURE = Boolean(process.env.SCREENSHOTS)
const OUT = path.resolve(process.env.SHOT_DIR ?? "docs/screenshots/crm-triage-bulk")

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
] as const

const cards = (page: Page) => page.locator("[data-slot=triage-card]")

async function shoot(page: Page, file: string) {
  if (!CAPTURE) return
  await settleAnimations(page)
  fs.mkdirSync(OUT, { recursive: true })
  await page.screenshot({ path: path.join(OUT, file), fullPage: true })
}

for (const viewport of VIEWPORTS) {
  test(`captures Triage default (${viewport.name})`, async ({ page }) => {
    const leaks = await vetUnmockedApi(page)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto("/crm/triage")
    await expect(page.getByRole("navigation", { name: "CRM", exact: true })).toBeVisible()
    await expect(
      cards(page)
        .first()
        .or(page.getByText("Triage is clear"))
        .or(page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" }))
    ).toBeVisible()
    await shoot(page, `triage-default-${viewport.name}.png`)
    leaks()
  })

  test(`captures Triage with a selection and the action bar (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto("/crm/triage")
    await expect(page.getByRole("navigation", { name: "CRM", exact: true })).toBeVisible()
    test.skip(
      (await cards(page).count()) === 0 || CAPTURE,
      "needs Triage rows, which only a database-backed server has; stills never show live data"
    )
    await page.getByRole("checkbox", { name: /^Select thread from / }).first().check()
    await expect(page.getByRole("region", { name: "Bulk triage" })).toContainText("1 selected")
  })
}
