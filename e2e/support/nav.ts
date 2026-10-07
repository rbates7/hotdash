import { expect, type Page } from "@playwright/test"

import { CLOSE_MENU_NAME, OPEN_MENU_NAME } from "../../src/components/app-header"

/** The named founder rail — visible as the desktop sidebar or inside the compact drawer. */
export function founderNav(page: Page) {
  return page.getByRole("navigation", { name: "Founder dashboard" })
}

export function openMenuButton(page: Page) {
  return page.getByRole("button", { name: OPEN_MENU_NAME })
}

/**
 * On phone / tablet portrait the rail lives in a closed sheet. Open it when
 * the compact header is showing; no-op on desktop where the rail is already out.
 */
export async function openFounderNav(page: Page) {
  const menu = openMenuButton(page)
  if (await menu.isVisible()) {
    await menu.click()
    await expect(founderNav(page)).toBeVisible()
    await expect(page.getByRole("button", { name: CLOSE_MENU_NAME })).toBeVisible()
  }
  return founderNav(page)
}
