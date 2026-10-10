import { expect, type Locator, type Page } from "@playwright/test"

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

/** The shared confirm's accessible name (its title). */
export const RESET_CONFIRM_NAME = "Reset demo data?"

/**
 * Reset is behind a confirm on every screen; click through it. Pass `scope`
 * (e.g. the page header) when more than one Reset button could be on the
 * page. The confirm is found by role and name — `dialog` "Reset demo
 * data?" — inside `confirmScope` (defaults to the page, since the dialog
 * is portalled out of the header), never as a bare page-wide dialog.
 */
export async function resetDemoData(
  page: Page,
  scope: Locator | Page = page,
  confirmScope: Locator | Page = page
) {
  const reset = scope.getByRole("button", { name: "Reset", exact: true })
  await expect(reset).toBeEnabled()
  await reset.click()
  const dialog = confirmScope.getByRole("dialog", { name: RESET_CONFIRM_NAME, exact: true })
  await expect(dialog).toBeVisible()
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

/**
 * Assert the write count for `key` is `expected` and then stays there for a
 * quiet window: a write loop would move it and never settle, so the poll
 * times out instead of passing on the first match.
 */
export async function expectWritesSettled(page: Page, key: string, expected: number, quietMs = 500) {
  await expect.poll(() => writesTo(page, key), { intervals: [50, 100, 200], timeout: 3_000 }).toBe(expected)
  const flatSince = Date.now()
  await expect
    .poll(
      async () => {
        const count = await writesTo(page, key)
        if (count !== expected) return `moved to ${count}`
        return Date.now() - flatSince >= quietMs ? "flat" : "waiting"
      },
      { intervals: [100], timeout: quietMs + 3_000 }
    )
    .toBe("flat")
}
