import { expect, test, type Page } from "@playwright/test"

import { expectProbeCatchesSabotage, expectReadable } from "./support/contrast"
import { setTheme } from "./support/theme"

/**
 * System Status: the real page only. Nothing is polled yet (Sentry and
 * chlkapp.com are not connected), so there are no checks and the header
 * says Not connected. There is no preview control and no `?preview=` route
 * (Coulson, relayed by Simmons, Oct 19); the seeded green / not-green views
 * are covered by the unit tests (status-screen.test.tsx, system-status.test.ts).
 *
 * Every lookup is anchored to a named region (`Current status`,
 * `Components`) inside `main`, or to the sidebar's named `nav` landmark.
 */
const rail = (page: Page) => page.getByRole("navigation", { name: "Founder dashboard", exact: true })
const main = (page: Page) => page.getByRole("main")
const header = (page: Page) => main(page).locator("header").first()
const banner = (page: Page) => main(page).getByRole("region", { name: "Current status", exact: true })
const components = (page: Page) => main(page).getByRole("region", { name: "Components", exact: true })

/** The real page: no checks, Not connected, nothing sample, no preview control. */
async function expectRealPage(page: Page) {
  await expect(main(page).getByRole("heading", { level: 1, name: "System Status" })).toBeVisible()
  await expect(banner(page)).toHaveAttribute("data-verdict", "empty")
  await expect(banner(page).getByRole("heading", { level: 2, name: "No checks yet" })).toBeVisible()
  await expect(banner(page)).toContainText("Nothing is connected. There are no checks to report.")
  await expect(header(page).getByTestId("not-connected")).toHaveText("Not connected")
  await expect(components(page)).toContainText("No checks")
  await expect(components(page).getByRole("listitem")).toHaveCount(0)
  await expect(main(page).getByRole("region", { name: "Past incident", exact: true })).toHaveCount(0)
  await expect(main(page).getByTestId("sample-data-tag")).toHaveCount(0)
  await expect(main(page).getByRole("note", { name: "Sample data" })).toHaveCount(0)
  await expect(main(page).getByRole("group", { name: "Preview", exact: true })).toHaveCount(0)
  await expect(main(page).locator('a[href*="preview="]')).toHaveCount(0)
}

test.describe("System Status", () => {
  test("is reachable from the sidebar and shows the real page: no checks, Not connected, no preview control", async ({ page }) => {
    await page.goto("/home")
    await rail(page).getByRole("link", { name: "System Status", exact: true }).click()
    await expect(page).toHaveURL(/\/system-status$/)
    await expect(rail(page).getByRole("link", { name: "System Status", exact: true })).toHaveAttribute("data-active")
    await expect(rail(page).getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("data-active")
    await expectRealPage(page)

    // The plain external link to Sentry stays; no bug list anywhere.
    const sentry = header(page).getByRole("link", { name: "Sentry", exact: true })
    await expect(sentry).toHaveAttribute("href", "https://chlk.sentry.io")
    await expect(sentry).toHaveAttribute("target", "_blank")
    await expect(main(page).getByRole("table")).toHaveCount(0)
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("hotdash.system-status")))).toEqual([])
  })

  test("?preview= is ignored: green, not-green and anything else all show the real page", async ({ page }) => {
    for (const value of ["green", "not-green", "empty", "purple"]) {
      await page.goto(`/system-status?preview=${value}`)
      await expectRealPage(page)
    }
  })

  test("every text node on the real page reads at ≥ 4.5:1 in both themes, solid, no opacity", async ({ page }) => {
    await page.goto("/system-status")
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme)
      await expectRealPage(page)
      await expectReadable(header(page), `${theme}/header`, expect)
      const bannerNodes = await expectReadable(banner(page), `${theme}/banner`, expect)
      expect(bannerNodes.map((n) => n.text)).toContain("No checks yet")
      await expectReadable(components(page), `${theme}/components`, expect)
    }
    await setTheme(page, "light")
  })

  test("the contrast probe itself catches sabotage (negative control)", async ({ page }) => {
    await page.goto("/system-status")
    await setTheme(page, "light")
    // One shared probe for every screen; if it stopped seeing unreadable
    // text, every contrast assertion above would pass vacuously.
    await expectProbeCatchesSabotage(header(page).getByTestId("not-connected"), "Not connected badge", expect)
    await expectProbeCatchesSabotage(banner(page), "banner (no checks)", expect)
    await setTheme(page, "dark")
    await expectProbeCatchesSabotage(components(page), "components (dark)", expect)
    await setTheme(page, "light")
  })
})
