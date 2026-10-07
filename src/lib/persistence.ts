/**
 * Browser persistence for a screen's demo state, shared by every screen that
 * saves edits locally (Agent Workplace / Home, Metrics, and the screens that
 * follow). There is no server copy; this is a stand-in until a datastore
 * lands.
 *
 * Policy, the same on every screen:
 * - **Persist only after a real edit.** Loading a page never writes, and
 *   neither does hydrating from another tab's `storage` event. Stores count
 *   user edits (`edits`) and `usePersistenceSync` writes only when that
 *   count moves — so two tabs can never ping-pong writes.
 * - **Never write what is already there.** `save` compares the serialized
 *   copy with what the key holds and skips identical writes.
 * - **Leave volatile fields out.** `serialize` strips per-page values such
 *   as a request clock, so copies compare equal across tabs.
 * - **Validate the whole copy, not the envelope.** `parse` (or the simpler
 *   `validate`) is the screen's guard; one malformed field drops the copy
 *   for the seed. `load()` is pure — it reports a rejected copy but writes
 *   nothing, so a bad copy in one tab never makes the others re-seed. The
 *   first real `save()` parks it under `<key>.rejected` (last three,
 *   timestamped) before overwriting it in place — the live key is never
 *   removed, so other tabs never see a clear; `quarantine()` parks on
 *   demand. Rejections are warned about in development.
 * - **Saving can fail.** `save` returns false on quota or private-mode
 *   errors; the note then says so and never claims "Saved".
 * - **Other tabs are heard.** `subscribe` fires when another tab writes or
 *   clears the key. A write re-hydrates; a clear (their Reset) re-seeds.
 *   A local edit that has not been saved yet wins over an incoming copy.
 * - **One clock rule.** The request's instant seeds the first hydrate on
 *   mount; a Reset, or the re-seed after another tab's Reset, reads
 *   `now()` at that moment and the shell's clock moves with it.
 * - **Reset clears the key** and the screen regenerates its seed from now.
 * - **Legacy keys** are removed on the first real save, not on load.
 *
 * Usage:
 *
 *   const store = createStorage<State, Saved>({
 *     key: "hotdash.<screen>.v2",
 *     legacyKeys: ["hotdash.<screen>.v1"],
 *     parse: parseSaved,            // unknown → Saved | null (or `validate` type guard)
 *     serialize: (s) => omitNow(s), // optional; what actually gets written
 *   })
 *   store.load(window.localStorage)      // → { state, status: "saved" } | { state: null, status: "empty" | "rejected" | "error", rejected? }
 *   store.save(window.localStorage, s)   // → boolean; no-op when identical; parks a rejected copy first
 *   store.clear(window.localStorage)
 *   store.subscribe((result) => …)       // other-tab changes; returns an unsubscribe
 *   usePersistenceSync({ storage, shell, onHydrate, onSaved })
 */

import * as React from "react"

import { now } from "@/lib/clock"

export type LoadStatus = "saved" | "empty" | "rejected" | "error"

export type RejectedCopy = { at: string; raw: string; why: string }

export type LoadResult<T> =
  | { state: T; status: "saved" }
  | { state: null; status: "empty" | "error" }
  /** The copy under the key did not parse; nothing was written — see `quarantine`. */
  | { state: null; status: "rejected"; rejected: RejectedCopy }

export type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">

export type StorageDef<T, S = T> = {
  /** Versioned key, e.g. "hotdash.metrics.v2". Bump when seed or shape changes. */
  key: string
  /** Older keys to drop on the first real save so a stale copy cannot linger. */
  legacyKeys?: readonly string[]
  /**
   * Turn a parsed JSON value into a saved copy, or null to reject it. Use
   * this to strip unknown fields and check every item. Required unless
   * `validate` is given.
   */
  parse?: (value: unknown) => S | null
  /** Simpler alternative to `parse`: an exhaustive type guard. */
  validate?: (value: unknown) => value is S
  /** What gets written; defaults to the state itself. Strip volatile fields here. */
  serialize?: (state: T) => S
}

/** How many rejected copies to keep under `<key>.rejected`. */
export const REJECTED_KEEP = 3

export type ScreenStorage<T, S = T> = {
  key: string
  /** Where copies that failed to parse are parked (newest first, capped). */
  rejectedKey: string
  /** Pure: reads and validates, never writes. */
  load: (storage: Storage | undefined) => LoadResult<S>
  /**
   * Write `state`; true when the key now holds it (including an identical
   * no-op). A copy under the key that does not parse is parked first.
   */
  save: (storage: Storage | undefined, state: T) => boolean
  /** Park a rejected copy under `<key>.rejected`; never touches the live key. */
  quarantine: (storage: Storage | undefined, rejected: RejectedCopy) => void
  clear: (storage: Storage | undefined) => void
  /** Whether the key currently holds anything (saved or not yet validated). */
  has: (storage: Storage | undefined) => boolean
  /** The parked rejected copies, newest first. */
  rejected: (storage: Storage | undefined) => RejectedCopy[]
  /**
   * Call `onChange` when *another* tab writes or clears the key. Same-tab
   * writes do not fire `storage` events, so this never echoes our own saves.
   */
  subscribe: (onChange: (result: LoadResult<S>) => void, target?: Window) => () => void
}

function warn(message: string, detail?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[persistence] ${message}`, detail ?? "")
  }
}

export function createStorage<T, S = T>(def: StorageDef<T, S>): ScreenStorage<T, S> {
  const { key, legacyKeys = [] } = def
  const rejectedKey = `${key}.rejected`
  const parse: (value: unknown) => S | null =
    def.parse ??
    ((value) => (def.validate && def.validate(value) ? value : null))
  const serialize = def.serialize ?? ((state: T) => state as unknown as S)

  function load(storage: Storage | undefined): LoadResult<S> {
    if (!storage) return { state: null, status: "empty" }
    try {
      const raw = storage.getItem(key)
      if (raw === null || raw === "") return { state: null, status: "empty" }
      const rejected = inspect(raw)
      if (rejected) {
        warn(`saved copy under ${key} ${rejected.why}; it will be parked on the next save`)
        return { state: null, status: "rejected", rejected }
      }
      return { state: parse(JSON.parse(raw)) as S, status: "saved" }
    } catch (error) {
      // Storage itself threw (disabled, sandboxed); the page still works.
      warn(`could not read ${key}`, error)
      return { state: null, status: "error" }
    }
  }

  function rejected(storage: Storage | undefined): RejectedCopy[] {
    try {
      const raw = storage?.getItem(rejectedKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (c): c is RejectedCopy =>
          !!c && typeof c === "object" && typeof (c as RejectedCopy).raw === "string"
      )
    } catch {
      return []
    }
  }

  /** Why `raw` cannot be loaded, or null when it parses. Pure. */
  function inspect(raw: string): RejectedCopy | null {
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch {
      return { at: new Date().toISOString(), raw, why: "is not JSON" }
    }
    if (parse(parsedJson) === null) {
      return { at: new Date().toISOString(), raw, why: "failed validation" }
    }
    return null
  }

  function quarantine(storage: Storage | undefined, copy: RejectedCopy) {
    if (!storage) return
    // Park the raw copy — newest first, capped. The live key is left alone:
    // removing it would fire a `storage` clear in every other tab and make
    // them re-seed; the save that follows simply overwrites it.
    try {
      const kept = [copy, ...rejected(storage).filter((r) => r.raw !== copy.raw)].slice(0, REJECTED_KEEP)
      storage.setItem(rejectedKey, JSON.stringify(kept))
    } catch {
      // Best effort: if we cannot park it, the save still overwrites it.
    }
    warn(`parked a rejected copy of ${key} under ${rejectedKey}`)
  }

  function save(storage: Storage | undefined, state: T): boolean {
    if (!storage) return false
    try {
      const next = JSON.stringify(serialize(state))
      const current = storage.getItem(key)
      // Identical copy already there (this tab's earlier write, or another
      // tab's): nothing to do, and no storage event to bounce around.
      if (current === next) return true
      // The first real save is when a bad copy gets backed up, not on load.
      if (current !== null && current !== "") {
        const bad = inspect(current)
        if (bad) quarantine(storage, bad)
      }
      storage.setItem(key, next)
      for (const legacy of legacyKeys) storage.removeItem(legacy)
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

  function subscribe(onChange: (result: LoadResult<S>) => void, target?: Window) {
    const win = target ?? (typeof window !== "undefined" ? window : undefined)
    if (!win) return () => {}
    const handler = (event: StorageEvent) => {
      // Only localStorage is ours; a sessionStorage event with the same key
      // would otherwise be read as "the copy is gone".
      if (event.storageArea && event.storageArea !== win.localStorage) return
      // `key` is null when the other tab called Storage.clear(); treat it as ours.
      if (event.key !== null && event.key !== key) return
      onChange(load(win.localStorage))
    }
    win.addEventListener("storage", handler)
    return () => win.removeEventListener("storage", handler)
  }

  return { key, rejectedKey, load, save, quarantine, clear, has, rejected, subscribe }
}

/* ------------------------------------------------------------- the hook */

/** The one place a store reads the clock after mount: Reset and cross-tab re-seeds. */
export function reseedNowMs() {
  return now().getTime()
}

/**
 * Wires a store to its storage the same way on every screen:
 * - hears other tabs and hands their copy (or their Reset) to `onHydrate`,
 *   together with `now()` read at that moment so a re-seed is dated today;
 * - writes **only when `shell.edits` moves** — a hydrate changes `data` but
 *   not `edits`, so it can never cause a write, and two tabs cannot loop;
 * - reports each write's outcome to `onSaved` for the note.
 *
 * `shell` is the store's `PersistenceShell` (see below); `edits` is bumped
 * by `persistenceShellReducer` for real edits only.
 */
export function usePersistenceSync<T, S = T>({
  storage,
  shell,
  onHydrate,
  onSaved,
}: {
  storage: ScreenStorage<T, S>
  shell: Pick<PersistenceShell<T>, "data" | "persisted" | "edits">
  onHydrate: (result: LoadResult<S>, nowMs: number) => void
  onSaved: (ok: boolean) => void
}) {
  const { data, persisted, edits } = shell
  React.useEffect(
    () => storage.subscribe((result) => onHydrate(result, reseedNowMs())),
    [storage, onHydrate]
  )

  const written = React.useRef(0)
  React.useEffect(() => {
    if (!persisted || edits === 0 || edits === written.current) return
    written.current = edits
    onSaved(storage.save(window.localStorage, data))
  }, [storage, data, persisted, edits, onSaved])
}

/* --------------------------------------------------------------- guards */

export const isString = (v: unknown): v is string => typeof v === "string"
export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v)
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean"
export const isStringOrNull = (v: unknown): v is string | null => v === null || isString(v)
export const isOptionalString = (v: unknown): v is string | undefined =>
  v === undefined || isString(v)

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

/** Every item parses, or the whole list is rejected (null). */
export function parseAll<T>(items: unknown, parseItem: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(items)) return null
  const out: T[] = []
  for (const item of items) {
    const parsed = parseItem(item)
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
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

/**
 * A screen's reducer state wrapped in the persistence bookkeeping above,
 * plus the monotonic edit counter the sync hook writes on and the clock
 * every relative figure is measured from.
 */
export type PersistenceShell<T> = PersistenceStatus & {
  data: T
  /** Count of real user edits; never reset, never moved by a hydrate. */
  edits: number
  /** `edits` as of the last successful save; `edits > savedEdits` means unsaved local work. */
  savedEdits: number
  /**
   * The instant the screen measures from: the request's on mount, then the
   * moment of a Reset (or of a re-seed after another tab's Reset). A store's
   * `adopt` may also move it forward when the copy it takes was saved on a
   * later day than this tab believes it is.
   */
  nowMs: number
}

/**
 * The events every persisted screen goes through. The screen's own reducer
 * produces `data`; this layer only decides what each transition means for
 * the note, the Reset button, the write gate and the clock.
 */
export type PersistenceEvent<T, S = T> =
  /**
   * localStorage was read: on mount (`nowMs` = the request's instant) or
   * because another tab changed it (`nowMs` = `now()` at that moment).
   * `fallback` builds the seed lazily, only when no copy is adopted.
   */
  | {
      type: "hydrate"
      result: LoadResult<S>
      nowMs: number
      fallback: (nowMs: number) => T
      adopt?: (saved: S, shell: PersistenceShell<T>) => { data: T; nowMs?: number }
    }
  /** The user did something. `data` is the reducer's output for it. */
  | { type: "edit"; data: T }
  /** A write to the key finished. */
  | { type: "save-result"; ok: boolean }
  /** The key was cleared; regenerate the seed from `nowMs` (read via `reseedNowMs`). */
  | { type: "reset"; nowMs: number; seed: (nowMs: number) => T }

export function initialShell<T>(data: T, nowMs: number): PersistenceShell<T> {
  return {
    data,
    edits: 0,
    savedEdits: 0,
    nowMs,
    persisted: false,
    edited: false,
    saved: false,
    saveFailed: false,
  }
}

/**
 * Shared transitions, so every screen gets the same guarantees:
 * - a hydrate never counts as an edit: `edited` goes false and `edits` does
 *   not move, so nothing is written back — another tab's copy is theirs,
 *   and their Reset (no copy) re-seeds this tab with `fallback(nowMs)`,
 *   moving the clock to `nowMs`;
 * - **a local edit that has not been saved yet wins** over an incoming
 *   copy: if `edits > savedEdits` when a hydrate brings a copy, this tab
 *   keeps its data, `edited`, `saved` and `saveFailed` exactly as they are,
 *   so a pending save overwrites the copy and a failed save keeps reading
 *   "Couldn't save" (same-render race; failure never masked). Another tab's
 *   Reset (no copy) still re-seeds this tab;
 * - an edit that changed nothing (`data === shell.data`) returns the *same*
 *   shell, so it neither flips `edited` nor triggers a write;
 * - `saved` reflects the write's result, never the intent;
 * - a save result that changes nothing returns the same shell too;
 * - reset returns to the never-edited state with `seed(nowMs)`, clock moved.
 */
export function persistenceShellReducer<T, S = T>(
  shell: PersistenceShell<T>,
  event: PersistenceEvent<T, S>
): PersistenceShell<T> {
  switch (event.type) {
    case "hydrate": {
      const pendingLocalEdits = shell.edits > shell.savedEdits
      if (pendingLocalEdits && event.result.state !== null) {
        // Ours is newer than anything we have written (a save is pending, or
        // the last one failed); keep it and let the next save win. `saved`
        // and `saveFailed` stay exactly as they are — an incoming copy must
        // not read as "Saved" over unsaved edits. Their Reset (no copy) is
        // not this branch: it still re-seeds this tab below.
        return shell.persisted ? shell : { ...shell, persisted: true }
      }
      if (event.result.state !== null) {
        const adopted = event.adopt
          ? event.adopt(event.result.state, shell)
          : { data: event.result.state as unknown as T }
        return {
          ...shell,
          data: adopted.data,
          nowMs: adopted.nowMs ?? shell.nowMs,
          persisted: true,
          edited: false,
          saved: true,
          saveFailed: false,
        }
      }
      // No copy — nothing saved, or another tab's Reset. A fresh seed dated
      // from this moment; nothing of ours is pending any more.
      return {
        ...shell,
        data: event.fallback(event.nowMs),
        nowMs: event.nowMs,
        savedEdits: shell.edits,
        persisted: true,
        edited: false,
        saved: false,
        saveFailed: false,
      }
    }
    case "edit":
      if (event.data === shell.data) return shell
      return { ...shell, data: event.data, edits: shell.edits + 1, edited: true }
    case "save-result": {
      const saved = event.ok ? true : shell.saved
      const savedEdits = event.ok ? shell.edits : shell.savedEdits
      if (shell.saveFailed === !event.ok && shell.saved === saved && shell.savedEdits === savedEdits) {
        return shell
      }
      return { ...shell, saved, savedEdits, saveFailed: !event.ok }
    }
    case "reset":
      return {
        ...shell,
        data: event.seed(event.nowMs),
        nowMs: event.nowMs,
        // Nothing of ours is pending after a reset; the key is cleared.
        savedEdits: shell.edits,
        edited: false,
        saved: false,
        saveFailed: false,
      }
  }
}
