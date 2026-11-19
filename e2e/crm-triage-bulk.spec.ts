import { expect, test, type Page } from "@playwright/test"

import { pageOverflowX } from "./support/shell"
import { expectTapTarget } from "./support/tap-target"

/**
 * Triage bulk select. The server Playwright starts has no CRM database (every
 * secret is blank; see playwright.config.ts), so /crm/triage renders the
 * durable-data error and no cards: the first test pins that the bulk bar
 * never shows there. The second runs only against a server whose Triage has
 * rows (a reused dev server with a database); it mocks
 * /api/crm/triage/resolve in the browser so no bulk action reaches the data.
 */

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const

const crmNav = (page: Page) => page.getByRole("navigation", { name: "CRM", exact: true })
const dataError = (page: Page) =>
  page.locator('[role="alert"]').filter({ hasText: "CRM couldn’t load" })
const cards = (page: Page) => page.locator("[data-slot=triage-card]")
const bar = (page: Page) => page.getByRole("region", { name: "Bulk triage" })
const selectAll = (page: Page) => page.getByRole("checkbox", { name: "Select all", exact: true })
const cardBoxes = (page: Page) => page.getByRole("checkbox", { name: /^Select thread from / })
const bulkStatus = (page: Page) => page.locator("[data-slot=triage-bulk-status]")

/** Wait for either cards, the clear state or the data error, and say which. */
async function triageState(page: Page) {
  const clear = page.getByText("Triage is clear")
  await expect(cards(page).first().or(clear).or(dataError(page))).toBeVisible()
  if (await dataError(page).isVisible()) return "error"
  return (await cards(page).count()) > 0 ? "cards" : "clear"
}

for (const viewport of VIEWPORTS) {
  test.describe(`Triage bulk select (${viewport.name} ${viewport.width}px)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
    })

    test("without Triage rows there is no bulk bar and the page stays usable", async ({ page }) => {
      await page.goto("/crm/triage")
      await expect(crmNav(page).getByRole("link", { name: "Triage" })).toHaveAttribute(
        "aria-current",
        "page"
      )
      const state = await triageState(page)
      test.skip(state === "cards", "this server has Triage rows; the next test covers them")
      await expect(bar(page)).toHaveCount(0)
      await expect(selectAll(page)).toHaveCount(0)
      await expect(cardBoxes(page)).toHaveCount(0)
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("select, select all, clear, and a bulk Ignore with one failure", async ({ page }) => {
      // Every resolve is answered here: the first thread fails, the rest succeed.
      const resolved: string[] = []
      await page.route("**/api/crm/triage/resolve", async (route) => {
        const body = route.request().postDataJSON() as { gmailThreadId: string }
        resolved.push(body.gmailThreadId)
        if (resolved.length === 1) {
          await route.fulfill({ status: 500, json: { error: "Failed to resolve the triage item." } })
        } else {
          await route.fulfill({ json: { caseId: null } })
        }
      })
      await page.goto("/crm/triage")
      test.skip(
        (await triageState(page)) !== "cards",
        "needs Triage rows; the e2e server has no CRM database"
      )

      const total = await cards(page).count()
      const first = cardBoxes(page).first()
      await expect(bar(page)).toHaveAttribute("data-selected", "false")

      if (viewport.width < 1280) {
        await expectTapTarget(first.locator("xpath=ancestor::label[1]"), "card checkbox")
        await expectTapTarget(selectAll(page).locator("xpath=ancestor::label[1]"), "Select all")
      }

      await first.check()
      await expect(bar(page)).toContainText("1 selected")
      await expect(bar(page).getByRole("button", { name: "Link contact" })).toHaveCount(0)
      if (total > 1) await expect(selectAll(page)).toHaveJSProperty("indeterminate", true)

      await selectAll(page).check()
      await expect(bar(page)).toContainText(`${total} selected`)
      await expect(cardBoxes(page).last()).toBeChecked()

      // The bar sticks while anything is selected.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await expect(bar(page).getByRole("button", { name: "Ignore", exact: true })).toBeInViewport()
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)

      await bar(page).getByRole("button", { name: "Clear selection" }).click()
      await expect(selectAll(page)).not.toBeChecked()
      await expect(bar(page).getByRole("button", { name: "Ignore", exact: true })).toHaveCount(0)

      await selectAll(page).check()
      await bar(page).getByRole("button", { name: "Ignore", exact: true }).click()
      await expect(bulkStatus(page)).toContainText("1 thread failed and stays selected")
      expect(resolved).toHaveLength(total)
      await expect(bar(page)).toContainText("1 selected")
    })
  })
}
