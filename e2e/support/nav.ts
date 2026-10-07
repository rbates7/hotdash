import { expect, type Page } from "@playwright/test"

import { OPEN_MENU_NAME } from "../../src/components/app-header"
import { EXPAND_SIDEBAR_NAME } from "../../src/components/app-sidebar"

/** The named founder rail — visible as the desktop/tablet rail or inside a drawer. */
export function founderNav(page: Page) {
  return page.getByRole("navigation", { name: "Founder dashboard" })
}

export function openMenuButton(page: Page) {
  return page.getByRole("button", { name: OPEN_MENU_NAME })
}

export function expandSidebarButton(page: Page) {
  return page.getByRole("button", { name: EXPAND_SIDEBAR_NAME })
}

export function founderNavDrawer(page: Page) {
  return page.getByRole("dialog", { name: "Menu" })
}

/**
 * Phone: the rail lives in a closed sheet — open it from the top bar.
 * Tablet portrait: the icon rail is already visible; opening the overlay is optional.
 * Desktop / tablet landscape: the rail is already out.
 */
export async function openFounderNav(page: Page) {
  const menu = openMenuButton(page)
  if (await menu.isVisible()) {
    await menu.click()
    await expect(founderNavDrawer(page)).toBeVisible()
    await expect(founderNav(page)).toBeVisible()
    return founderNav(page)
  }
  return founderNav(page)
}
