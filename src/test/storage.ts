import { vi } from "vitest"

import type { Storage } from "@/lib/persistence"

/**
 * A storage whose writes fail the way a full or private-mode browser does.
 * Reads still work so a screen can hydrate and then discover it cannot save.
 */
export function quotaExceededStorage(backing: Storage = window.localStorage): Storage {
  return {
    getItem: (k) => backing.getItem(k),
    removeItem: (k) => backing.removeItem(k),
    setItem: vi.fn(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    }),
  }
}

/** Fire the cross-tab `storage` event the way another tab's write would. */
export function fireStorageEvent(key: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", { key, newValue, storageArea: window.localStorage })
  )
}
