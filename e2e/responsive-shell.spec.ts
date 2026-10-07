import { expect, test } from "@playwright/test"

import { CLOSE_MENU_NAME } from "../src/components/app-header"
import { founderNav, openFounderNav, openMenuButton } from "./support/nav"

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet-portrait", width: 820, height: 1180 },
] as const

async function pageOverflowX(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive shell (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test("opens the menu, navigates, and does not scroll the page sideways", async ({ page }) => {
      await page.goto("/home")
      await expect(openMenuButton(page)).toBeVisible()
      await expect(founderNav(page)).toHaveCount(0)

      const rail = await openFounderNav(page)
      await rail.getByRole("link", { name: "Metrics", exact: true }).click()
      await expect(page).toHaveURL(/\/metrics$/)
      await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
      await expect(founderNav(page)).toHaveCount(0)
      await expect(openMenuButton(page)).toBeVisible()
      expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
    })

    test("Escape closes the drawer and returns focus to the menu button", async ({ page }) => {
      await page.goto("/home")
      await openMenuButton(page).press("Enter")
      await expect(founderNav(page)).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(founderNav(page)).toHaveCount(0)
      await expect(openMenuButton(page)).toBeFocused()
    })
  })
}

test.describe("responsive shell (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the rail and does not show the compact menu button", async ({ page }) => {
    await page.goto("/home")
    // The header stays in the DOM (`lg:hidden`) so 1440 does not remount it;
    // it must not be visible and must not steal the rail.
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(page.getByRole("button", { name: CLOSE_MENU_NAME })).not.toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    await founderNav(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
  })
})
