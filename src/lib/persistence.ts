/**
 * Browser persistence for a screen's demo state, shared by every screen that
 * saves edits locally (Agent Workplace / Home, Metrics, and the screens that
 * follow). There is no server copy; this is a stand-in until a datastore
 * lands.
 *
 * Policy, the same on every screen:
 * - **Persist only after a real edit.** Loading a page never writes. A
 *   browser that only looked at the seed keeps getting a fresh seed, dated
 *   from today.
 * - **Validate the whole copy, not the envelope.** `validate` is the
 *   screen's type guard; one malformed field drops the copy for the seed.
 *   A rejected copy is kept under `<key>.rejected` (so nothing is lost
 *   before the next save overwrites it) and warned about in development.
 * - **Saving can fail.** `save` returns false on quota or private-mode
 *   errors; the note then says so and never claims "Saved".
 * - **Other tabs are heard.** `subscribe` fires when another tab writes or
 *   clears the key, so two tabs re-hydrate instead of clobbering each other.
 * - **Reset clears the key** and the screen regenerates its seed from now.
 *
 * Usage:
 *
 *   const store = createStorage<State>({ key: "hotdash.<screen>.v2", legacyKeys: ["hotdash.<screen>.v1"], validate: isState })
 *   store.load(window.localStorage)      // → { state, status: "saved" | "empty" | "rejected" | "error" }
 *   store.save(window.localStorage, s)   // → boolean
 *   store.clear(window.localStorage)
 *   store.subscribe((result) => …)       // other-tab changes; returns an unsubscribe
 */

export type LoadStatus = "saved" | "empty" | "rejected" | "error"

export type LoadResult<T> =
  | { state: T; status: "saved" }
  | { state: null; status: Exclude<LoadStatus, "saved"> }

export type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">

export type StorageDef<T> = {
  /** Versioned key, e.g. "hotdash.metrics.v2". Bump when seed or shape changes. */
  key: string
  /** Older keys to drop on load so a stale copy cannot linger beside the new one. */
  legacyKeys?: readonly string[]
  /** The screen's exhaustive type guard. */
  validate: (value: unknown) => value is T
}

export type ScreenStorage<T> = {
  key: string
  /** Where a copy that failed `validate` is parked. */
  rejectedKey: string
  load: (storage: Storage | undefined) => LoadResult<T>
  save: (storage: Storage | undefined, state: T) => boolean
  clear: (storage: Storage | undefined) => void
  /** Whether the key currently holds anything (saved or not yet validated). */
  has: (storage: Storage | undefined) => boolean
  /**
   * Call `onChange` when *another* tab writes or clears the key. Same-tab
   * writes do not fire `storage` events, so this never echoes our own saves.
   */
  subscribe: (onChange: (result: LoadResult<T>) => void, target?: Window) => () => void
}

function warn(message: string, detail?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[persistence] ${message}`, detail ?? "")
  }
}

export function createStorage<T>(def: StorageDef<T>): ScreenStorage<T> {
  const { key, legacyKeys = [], validate } = def
  const rejectedKey = `${key}.rejected`

  function load(storage: Storage | undefined): LoadResult<T> {
    if (!storage) return { state: null, status: "empty" }
    try {
      for (const legacy of legacyKeys) storage.removeItem(legacy)
      const raw = storage.getItem(key)
      if (raw === null || raw === "") return { state: null, status: "empty" }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        reject(storage, raw, "is not JSON", error)
        return { state: null, status: "rejected" }
      }
      if (!validate(parsed)) {
        reject(storage, raw, "failed validation")
        return { state: null, status: "rejected" }
      }
      return { state: parsed, status: "saved" }
    } catch (error) {
      // Storage itself threw (disabled, sandboxed); the page still works.
      warn(`could not read ${key}`, error)
      return { state: null, status: "error" }
    }
  }

  function reject(storage: Storage, raw: string, why: string, error?: unknown) {
    // Park the raw copy before anything overwrites it, then drop the live
    // key so the next load does not trip over it again.
    try {
      storage.setItem(rejectedKey, raw)
      storage.removeItem(key)
    } catch {
      // Best effort: if we cannot park it we still refuse to load it.
    }
    warn(`saved copy under ${key} ${why}; kept it under ${rejectedKey}`, error)
  }

  function save(storage: Storage | undefined, state: T): boolean {
    if (!storage) return false
    try {
      storage.setItem(key, JSON.stringify(state))
      return true
    } catch (error) {
      // QuotaExceededError, Safari private mode, or a disabled store.
      warn(`could not save ${key}`, error)
      return false
    }
  }

  function clear(storage: Storage | undefined) {
    try {
      storage?.removeItem(key)
    } catch {
      // Nothing to do; the next load falls back to the seed anyway.
    }
  }

  function has(storage: Storage | undefined) {
    try {
      const raw = storage?.getItem(key)
      return raw !== null && raw !== undefined && raw !== ""
    } catch {
      return false
    }
  }

  function subscribe(onChange: (result: LoadResult<T>) => void, target?: Window) {
    const win = target ?? (typeof window !== "undefined" ? window : undefined)
    if (!win) return () => {}
    const handler = (event: StorageEvent) => {
      // Only localStorage is ours; a sessionStorage event with the same key
      // would otherwise be read as "the copy is gone".
      if (event.storageArea && event.storageArea !== win.localStorage) return
      // `key` is null when the other tab called clear(); treat it as ours.
      if (event.key !== null && event.key !== key) return
      onChange(load(win.localStorage))
    }
    win.addEventListener("storage", handler)
    return () => win.removeEventListener("storage", handler)
  }

  return { key, rejectedKey, load, save, clear, has, subscribe }
}

/* --------------------------------------------------------------- guards */

export const isString = (v: unknown): v is string => typeof v === "string"
export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean"

/** An ISO timestamp that survives a round trip, e.g. "2026-08-27T14:00:00.000Z". */
export function isIsoInstant(v: unknown): v is string {
  if (!isString(v)) return false
  const t = Date.parse(v)
  return Number.isFinite(t) && new Date(t).toISOString() === v
}

/** No duplicates, in first-seen order. */
export function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

/* ------------------------------------------------------------- status */

/**
 * What the shared PersistenceNote shows. Every screen's store exposes this
 * shape so the note, Reset and its confirm read identically everywhere.
 */
export type PersistenceStatus = {
  /** localStorage has been consulted; the screen shows real data. */
  persisted: boolean
  /**
   * The user changed something — a *real* change, since the last hydrate.
   * This is the write gate: nothing is written to the key until it is true,
   * and a copy merely found on load (or taken from another tab) does not
   * set it, so loading never writes.
   */
  edited: boolean
  /** The key currently holds a copy (ours or an earlier session's). */
  saved: boolean
  /** The last write failed (quota, private mode); nothing is saved. */
  saveFailed: boolean
}

export type PersistenceStore = PersistenceStatus & {
  /** Clear the key and regenerate the seed from now. */
  resetDemoData: () => void
}

/* -------------------------------------------------------------- shell */

/** A screen's reducer state wrapped in the persistence bookkeeping above. */
export type PersistenceShell<T> = PersistenceStatus & { data: T }

/**
 * The events every persisted screen goes through. The screen's own reducer
 * produces `data`; this layer only decides what each transition means for
 * the note, the Reset button and the write gate.
 */
export type PersistenceEvent<T> =
  /** localStorage was read (on mount, or because another tab changed it). */
  | { type: "hydrate"; result: LoadResult<T>; fallback: T }
  /** The user did something. `data` is the reducer's output for it. */
  | { type: "edit"; data: T }
  /** A write to the key finished. */
  | { type: "save-result"; ok: boolean }
  /** The key was cleared and the seed regenerated. */
  | { type: "reset"; data: T }

export function initialShell<T>(data: T): PersistenceShell<T> {
  return { data, persisted: false, edited: false, saved: false, saveFailed: false }
}

/**
 * Shared transitions, so every screen gets the same guarantees:
 * - a hydrate never counts as an edit (`edited` false → nothing written back);
 * - an edit that changed nothing (`data === shell.data`) returns the *same*
 *   shell, so it neither flips `edited`/`saved` nor triggers a write — the
 *   screen's reducer must return its input for no-ops, which also keeps
 *   `updatedAt` untouched;
 * - a save result that changes nothing returns the same shell too;
 * - reset returns to the never-edited state.
 */
export function persistenceShellReducer<T>(
  shell: PersistenceShell<T>,
  event: PersistenceEvent<T>
): PersistenceShell<T> {
  switch (event.type) {
    case "hydrate":
      return {
        data: event.result.state ?? event.fallback,
        persisted: true,
        edited: false,
        saved: event.result.status === "saved",
        saveFailed: false,
      }
    case "edit":
      if (event.data === shell.data) return shell
      return { ...shell, data: event.data, edited: true, saved: true }
    case "save-result":
      if (shell.saveFailed === !event.ok) return shell
      return { ...shell, saveFailed: !event.ok }
    case "reset":
      return { data: event.data, persisted: shell.persisted, edited: false, saved: false, saveFailed: false }
  }
}
