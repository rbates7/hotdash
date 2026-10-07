import { expect, test } from "@playwright/test"

import { APP_HEADER_NAME } from "../src/components/app-header"
import {
  CLOSE_DRAWER_NAME,
  COLLAPSE_SIDEBAR_NAME,
} from "../src/components/app-sidebar"
import { FOUNDER_NAME } from "../src/components/founder-identity"
import { navItems } from "../src/lib/nav"
import { setTheme } from "./support/theme"
import {
  expandSidebarButton,
  founderNav,
  founderNavDrawer,
  openFounderNav,
  openMenuButton,
} from "./support/nav"
import {
  expectChevronFullyHit,
  expectDrawerClosed,
  expectFocusRing,
  expectFocusTrapped,
  expectNavLinkHeights,
  expectNoOverflowX,
  expectOneAriaCurrent,
  expectScrollLock,
  expectShellReadable,
  sheetOverlay,
  waitForHydration,
} from "./support/shell"

const NAV_LINK_COUNT = navItems.length

async function gotoHydrated(page: import("@playwright/test").Page, path = "/home") {
  await page.goto(path)
  await waitForHydration(page)
}

test.describe("responsive shell (phone 390)", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("top bar shows founder identity and opens the overlay drawer", async ({ page }) => {
    await gotoHydrated(page)
    await expect(openMenuButton(page)).toBeVisible()
    await expect(
      page.getByRole("region", { name: APP_HEADER_NAME }).getByText(FOUNDER_NAME)
    ).toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)

    const rail = await openFounderNav(page)
    await expect(
      founderNavDrawer(page).getByRole("button", { name: CLOSE_DRAWER_NAME })
    ).toBeVisible()
    const links = rail.getByRole("link")
    await expect(links).toHaveCount(NAV_LINK_COUNT)
    await rail.getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expect(openMenuButton(page)).toBeVisible()
    await expectNoOverflowX(page)
  })

  test("drawer is 288px, traps focus, and each close returns focus", async ({ page }) => {
    await gotoHydrated(page)
    const menu = openMenuButton(page)
    await expect(menu).toBeVisible()
    await expect(menu).toBeEnabled()
    await menu.press("Enter")
    const drawer = founderNavDrawer(page)
    await expect(drawer).toBeVisible()
    const box = await drawer.boundingBox()
    expect(box, "drawer box").toBeTruthy()
    expect(Math.abs(box!.width - 288)).toBeLessThanOrEqual(1)
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, drawer)

    await page.keyboard.press("Escape")
    await expectDrawerClosed(page, menu)

    await menu.click()
    await expect(drawer).toBeVisible()
    await drawer.getByRole("button", { name: CLOSE_DRAWER_NAME }).click()
    await expectDrawerClosed(page, menu)

    await menu.click()
    await expect(drawer).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 360, y: 80 }, force: true })
    await expectDrawerClosed(page, menu)
  })

  test("a nav link closes the drawer, including the current page", async ({ page }) => {
    await gotoHydrated(page)
    await openFounderNav(page)
    await founderNavDrawer(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expect(openMenuButton(page)).toBeVisible()
    await expectScrollLock(page, false)

    await openFounderNav(page)
    await founderNavDrawer(page).getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(founderNavDrawer(page)).toHaveCount(0)
  })

  test("exactly one aria-current and no horizontal overflow", async ({ page }) => {
    await gotoHydrated(page)
    // Phone chrome is the top bar only; the nav lives in the overlay.
    await expect(page.locator("[aria-current='page']")).toHaveCount(0)
    await expectNoOverflowX(page)
    await openFounderNav(page)
    await expectOneAriaCurrent(page)
    await expect(
      founderNavDrawer(page).getByRole("link", { name: "Home", exact: true })
    ).toHaveAttribute("aria-current", "page")
  })
})

test.describe("responsive shell (tablet portrait 820)", () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  test("keeps the icon rail and does not show the phone top bar", async ({ page }) => {
    await gotoHydrated(page)
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    const links = founderNav(page).getByRole("link")
    await expect(links).toHaveCount(NAV_LINK_COUNT)
    await founderNav(page).getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { level: 1, name: "Metrics" })).toBeVisible()
    await expectNoOverflowX(page)
  })

  test("expand opens a 256 floating card; chevron is fully hittable", async ({ page }) => {
    await gotoHydrated(page)
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expandSidebarButton(page).click()
    const drawer = founderNavDrawer(page)
    await expect(drawer).toBeVisible()
    const card = drawer.locator("[data-slot='founder-drawer-card']")
    const box = await card.boundingBox()
    expect(box, "drawer card").toBeTruthy()
    expect(Math.abs(box!.width - 256)).toBeLessThanOrEqual(1)
    const chevron = drawer.getByRole("button", { name: COLLAPSE_SIDEBAR_NAME })
    await expect(chevron).toBeVisible()
    await expectChevronFullyHit(page, chevron)
    await expectScrollLock(page, true)
    await expectFocusTrapped(page, drawer)
    await expectOneAriaCurrent(page)
  })

  test("chevron, Escape, and scrim each close and return focus", async ({ page }) => {
    await gotoHydrated(page)
    const expand = expandSidebarButton(page)

    await expand.click()
    await expect(founderNavDrawer(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expectDrawerClosed(page, expand)

    await expand.click()
    await founderNavDrawer(page)
      .getByRole("button", { name: COLLAPSE_SIDEBAR_NAME })
      .click()
    await expectDrawerClosed(page, expand)

    await expand.click()
    await expect(founderNavDrawer(page)).toBeVisible()
    await sheetOverlay(page).click({ position: { x: 400, y: 40 } })
    await expectDrawerClosed(page, expand)
  })

  test("a nav link closes the drawer, including the current page", async ({ page }) => {
    await gotoHydrated(page)
    await expandSidebarButton(page).click()
    await founderNavDrawer(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expectScrollLock(page, false)

    await expandSidebarButton(page).click()
    await founderNavDrawer(page).getByRole("link", { name: "Metrics", exact: true }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(founderNavDrawer(page)).toHaveCount(0)
  })

  test("rail width is already ≤76px before and after hydration", async ({ page }) => {
    await page.goto("/home", { waitUntil: "domcontentloaded" })
    const rail = page.locator("[data-slot='sidebar-container']")
    const early = await rail.boundingBox()
    expect(early, "rail at first paint").toBeTruthy()
    expect(early!.width).toBeLessThanOrEqual(76)
    await waitForHydration(page)
    const late = await rail.boundingBox()
    expect(late, "rail after hydration").toBeTruthy()
    expect(late!.width).toBeLessThanOrEqual(76)
    expect(Math.abs(early!.width - late!.width)).toBeLessThanOrEqual(1)
    await expectOneAriaCurrent(page)
    await expectNoOverflowX(page)
  })
})

test.describe("responsive shell (tablet portrait 820, JS disabled)", () => {
  test.use({
    viewport: { width: 820, height: 1180 },
    javaScriptEnabled: false,
  })

  test("icon rail is ≤76px with no visible labels", async ({ page }) => {
    await page.goto("/home")
    const rail = page.locator("[data-slot='sidebar-container']")
    const box = await rail.boundingBox()
    expect(box, "rail box").toBeTruthy()
    expect(box!.width).toBeLessThanOrEqual(76)
    const names = page.getByText(FOUNDER_NAME)
    expect(await names.count()).toBeGreaterThan(0)
    for (const name of await names.all()) {
      await expect(name).toBeHidden()
    }
    const home = page.getByRole("link", { name: "Home", exact: true })
    const labelHidden = await home.evaluate((el) => {
      const span = el.querySelector("span")
      if (!span) return false
      const r = span.getBoundingClientRect()
      return r.width <= 1 && r.height <= 1
    })
    expect(labelHidden, "Home label is sr-only on the icon rail").toBe(true)
  })
})

test.describe("responsive shell (tablet landscape 1180)", () => {
  test.use({ viewport: { width: 1180, height: 820 } })

  test("expanded rail uses 44px rows and does not show the phone menu", async ({ page }) => {
    await gotoHydrated(page)
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expect(founderNav(page)).toBeVisible()
    const links = founderNav(page).getByRole("link")
    await expect(links).toHaveCount(NAV_LINK_COUNT)
    await expectNavLinkHeights(page, { min: 44 })
    await expectOneAriaCurrent(page)
    await expectNoOverflowX(page)
    await founderNav(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
  })
})

test.describe("responsive shell (desktop 1440)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("keeps the 32px rail and does not show the compact menu button", async ({ page }) => {
    await gotoHydrated(page)
    await expect(openMenuButton(page)).not.toBeVisible()
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expect(founderNav(page)).toBeVisible()
    const links = founderNav(page).getByRole("link")
    await expect(links).toHaveCount(NAV_LINK_COUNT)
    await expectNavLinkHeights(page, { exact: 32 })
    await expectOneAriaCurrent(page)
    await expectNoOverflowX(page)
    await founderNav(page).getByRole("link", { name: "Home", exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
  })
})

test.describe("responsive shell (viewport leave)", () => {
  test("resizing 390→1440→390 closes the overlay and drops the scroll lock", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoHydrated(page)
    await openFounderNav(page)
    await expect(founderNavDrawer(page)).toBeVisible()
    await expectScrollLock(page, true)

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expectScrollLock(page, false)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(founderNavDrawer(page)).toHaveCount(0)
    await expectScrollLock(page, false)
    await expect(openMenuButton(page)).toBeVisible()
  })
})

test.describe("responsive shell (contrast and focus ring)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} top bar, rails, and drawers meet contrast`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width: 390, height: 844 })
      await gotoHydrated(page)
      await setTheme(page, theme)
      await expectShellReadable(
        page.getByRole("region", { name: APP_HEADER_NAME }),
        `${theme}/phone top bar`
      )
      await expectFocusRing(openMenuButton(page))
      await openFounderNav(page)
      await expectShellReadable(founderNavDrawer(page), `${theme}/phone drawer`)
      await page.keyboard.press("Escape")

      await page.setViewportSize({ width: 820, height: 1180 })
      await gotoHydrated(page)
      await setTheme(page, theme)
      await expectShellReadable(founderNav(page), `${theme}/tablet rail`)
      await expandSidebarButton(page).click()
      await expectShellReadable(founderNavDrawer(page), `${theme}/tablet drawer`)
      await page.keyboard.press("Escape")

      await page.setViewportSize({ width: 1180, height: 820 })
      await gotoHydrated(page)
      await setTheme(page, theme)
      await expectShellReadable(founderNav(page), `${theme}/1180 rail`)
      await expectFocusRing(founderNav(page).getByRole("link").first())

      await page.setViewportSize({ width: 1440, height: 900 })
      await gotoHydrated(page)
      await setTheme(page, theme)
      await expectShellReadable(founderNav(page), `${theme}/desktop rail`)
    })
  }
})
