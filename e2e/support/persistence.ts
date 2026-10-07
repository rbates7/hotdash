import { expect, type Page } from "@playwright/test"

/** The shared PersistenceNote's copy, mirrored from `@/components/persistence-note`. */
export const NOTE = {
  unsaved: "Edits save in this browser",
  saved: "Saved in this browser",
  failed: "Couldn't save in this browser",
} as const

/** Reset is behind a confirm on every screen; click through it. */
export async function resetDemoData(page: Page) {
  const reset = page.getByRole("button", { name: "Reset", exact: true })
  await expect(reset).toBeEnabled()
  await reset.click()
  const dialog = page.getByRole("dialog", { name: "Reset demo data?" })
  await dialog.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(dialog).toBeHidden()
}
