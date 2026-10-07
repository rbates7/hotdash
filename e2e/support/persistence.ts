import { expect, type Page } from "@playwright/test"

/** The shared PersistenceNote's copy, mirrored from `@/components/persistence-note`. */
export const NOTE = {
  unsaved: "Edits save in this browser",
  saved: "Saved in this browser",
  failed: "Couldn't save in this browser",
} as const

/** The note's accessible name, mirrored from `PERSISTENCE_NOTE_NAME`. */
export const NOTE_NAME = "Where edits live"

/**
 * The persistence note, by role and name. It is a `status` live region
 * normally and an `alert` once a save has failed, so pass `failed` to find
 * it in that state.
 */
export function persistenceNote(page: Page, { failed = false } = {}) {
  return page.getByRole(failed ? "alert" : "status", { name: NOTE_NAME, exact: true })
}

/** Reset is behind a confirm on every screen; click through it. */
export async function resetDemoData(page: Page) {
  const reset = page.getByRole("button", { name: "Reset", exact: true })
  await expect(reset).toBeEnabled()
  await reset.click()
  const dialog = page.getByRole("dialog", { name: "Reset demo data?" })
  await dialog.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Count `localStorage.setItem` calls to `key` from before the page's own
 * scripts run. Install on the context so every page (every tab) gets it,
 * then read with `writesTo(page, key)`.
 */
export async function countWrites(target: Pick<Page, "addInitScript">, key: string) {
  await target.addInitScript((k) => {
    const w = window as unknown as { __writes: Record<string, number> }
    w.__writes = w.__writes ?? {}
    w.__writes[k] = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name === k && this === window.localStorage) w.__writes[k] += 1
      return original.call(this, name, value)
    }
  }, key)
}

export function writesTo(page: Page, key: string) {
  return page.evaluate(
    (k) => (window as unknown as { __writes: Record<string, number> }).__writes?.[k] ?? 0,
    key
  )
}
