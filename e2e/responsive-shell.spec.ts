import { expect, test } from "@playwright/test"

import { APP_HEADER_NAME, CLOSE_MENU_NAME } from "../src/components/app-header"
import { CLOSE_DRAWER_NAME, COLLAPSE_SIDEBAR_NAME } from "../src/components/app-sidebar"
import { FOUNDER_NAME } from "../src/components/founder-identity"
import {
  expandSidebarButton,
  founderNav,
  founderNavDrawer,
  openFounderNav,
  openMenuButton,
} from "./support/nav"

async function pageOverflowX(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test.describe("responsive shell (phone 390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("top bar shows founder identity and opens the overlay drawer", async ({ page }) => {
    await page.goto("/home")
    await expect(openMenuButton(page)).toBeVisible()
    await expect(
      page.getByRole("region", { name: APP_HEADER_NAME }).getByText(FOUNDER_NAME)
    ).toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)

    const rail = await openFounderNav(page)
    await expect(founderNavDrawer(page).getByRole("button", { name: CLOSE_DRAWER_NAME })).toBeVisible()
    await rail.getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expect(openMenuButton(page)).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("Escape closes the drawer and returns focus to the menu button", async ({ page }) => {
    await page.goto("/home")
    await openMenuButton(page).press("Enter")
    const drawer = founderNavDrawer(page)
    await expect(drawer).toBeVisible()
    await drawer.getByRole("button", { name: CLOSE_DRAWER_NAME }).press("Escape")
    await expect(drawer).toHaveCount(0)
    await expect(openMenuButton(page)).toBeFocused()
  })
})

test.describe("responsive shell (tablet portrait 820)", () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test("keeps the icon rail and does not show the phone top bar", async ({ page }) => {
    await page.goto("/home")
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    await founderNav(page).getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    expect(await pageOverflowX(page)).toBeLessThanOrEqual(1)
  })

  test("expand opens an overlay drawer; Escape returns focus to the rail toggle", async ({
    page,
  }) => {
    await page.goto("/home")
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expandSidebarButton(page).click()
    const drawer = founderNavDrawer(page)
    await expect(drawer).toBeVisible()
    await drawer.getByRole("button", { name: COLLAPSE_SIDEBAR_NAME }).press("Escape")
    await expect(drawer).toHaveCount(0)
    await expect(expandSidebarButton(page)).toBeFocused()
  })
})

test.describe("responsive shell (tablet landscape 1180)", () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test("keeps the expanded rail and does not show the phone menu", async ({ page }) => {
    await page.goto("/home")
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(page.getByRole("button", { name: CLOSE_MENU_NAME })).not.toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    await founderNav(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
  })
})

test.describe("responsive shell (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the rail and does not show the compact menu button", async ({ page }) => {
    await page.goto("/home")
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(page.getByRole("button", { name: CLOSE_MENU_NAME })).not.toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    await founderNav(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
  })
})
