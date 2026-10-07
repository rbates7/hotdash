"use client"

import * as React from "react"

import { seedState } from "@/lib/roadmap/fixture"
import {
  DEFAULT_OWNER,
  MAX_TITLE,
  MAX_WHY,
  MAX_WINDOW,
  inColumn,
  normalizeColumn,
  parseState,
  type RoadmapColumn,
  type RoadmapItem,
  type RoadmapOwner,
  type RoadmapState,
} from "@/lib/roadmap/roadmap"

export type NewItemInput = {
  title: string
  why?: string
  owner?: RoadmapOwner
  window?: string
  column?: RoadmapColumn
}

/** The fields a founder can rewrite on an existing bet. */
export type ItemPatch = Partial<Pick<RoadmapItem, "title" | "why" | "owner" | "window">>

export type Action =
  | { type: "add"; input: NewItemInput; at: string }
  | { type: "patch"; id: string; patch: ItemPatch; at: string }
  | { type: "move"; id: string; column: RoadmapColumn; at: string }
  | { type: "reorder"; id: string; direction: -1 | 1; at: string }
  | { type: "remove"; id: string }
  | { type: "hydrate"; state: RoadmapState | null }
  | { type: "reset" }
  | { type: "save-result"; ok: boolean }

function text(value: string | undefined, max: number): string | undefined {
  return value === undefined ? undefined : value.trim().slice(0, max)
}

/**
 * Pure. `nowMs` is the request clock handed down from the page; it is only
 * used to rebuild the seed (reset, or hydrating with nothing saved). Every
 * edit carries its own `at` stamp, also derived from that clock by the
 * provider — nothing in here reads `Date`.
 *
 * Every edit that changes nothing returns the *same* state object, so the
 * caller can tell a real edit from a no-op without diffing.
 */
export function reducer(state: RoadmapState, action: Action, nowMs: number): RoadmapState {
  switch (action.type) {
    case "add": {
      const title = text(action.input.title, MAX_TITLE)
      if (!title) return state
      const column = action.input.column ?? "later"
      const item: RoadmapItem = {
        id: `rm-${state.nextId}`,
        title,
        why: text(action.input.why, MAX_WHY) ?? "",
        owner: action.input.owner ?? DEFAULT_OWNER,
        window: text(action.input.window, MAX_WINDOW) ?? "",
        column,
        order: inColumn(state.items, column).length,
        linkedTickets: 0,
        signedAt: action.at,
        updatedAt: action.at,
      }
      return { items: [...state.items, item], nextId: state.nextId + 1 }
    }

    case "patch": {
      const target = state.items.find((i) => i.id === action.id)
      if (!target) return state
      const title = text(action.patch.title, MAX_TITLE)
      const next: RoadmapItem = {
        ...target,
        // A blank title is not an edit; keep the one we have.
        title: title ? title : target.title,
        why: text(action.patch.why, MAX_WHY) ?? target.why,
        window: text(action.patch.window, MAX_WINDOW) ?? target.window,
        owner: action.patch.owner ?? target.owner,
      }
      const rewritten =
        next.title !== target.title || next.why !== target.why || next.window !== target.window
      if (!rewritten && next.owner === target.owner) return state
      // Rewriting the words makes the bet the founder's; a sample tag on
      // text we did not write would be a lie. Re-owning keeps the tag.
      if (rewritten && next.sample) delete next.sample
      next.updatedAt = action.at
      return { ...state, items: state.items.map((i) => (i === target ? next : i)) }
    }

    case "move": {
      const target = state.items.find((i) => i.id === action.id)
      if (!target || target.column === action.column) return state
      const from = target.column
      const moved: RoadmapItem = {
        ...target,
        column: action.column,
        order: inColumn(state.items, action.column).length,
        updatedAt: action.at,
      }
      const items = state.items.map((i) => (i === target ? moved : i))
      return { ...state, items: normalizeColumn(items, from) }
    }

    case "reorder": {
      const target = state.items.find((i) => i.id === action.id)
      if (!target) return state
      const ordered = inColumn(state.items, target.column)
      const index = ordered.findIndex((i) => i.id === target.id)
      const swapWith = index + action.direction
      if (swapWith < 0 || swapWith >= ordered.length) return state
      const position = new Map(ordered.map((item, i) => [item.id, i]))
      position.set(target.id, swapWith)
      position.set(ordered[swapWith].id, index)
      return {
        ...state,
        items: state.items.map((i) => {
          const order = position.get(i.id)
          if (order === undefined || order === i.order) return i
          return i.id === target.id ? { ...i, order, updatedAt: action.at } : { ...i, order }
        }),
      }
    }

    case "remove": {
      const target = state.items.find((i) => i.id === action.id)
      if (!target) return state
      return {
        ...state,
        items: normalizeColumn(
          state.items.filter((i) => i !== target),
          target.column
        ),
      }
    }

    case "hydrate":
      return action.state ?? seedState(nowMs)

    case "reset":
      return seedState(nowMs)

    case "save-result":
      return state
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage — from the first real
 * edit on, never the untouched seed, never on mount — so a reload keeps the
 * sequence. Bump the version whenever the seed or the shape changes so stale
 * saves are discarded instead of half-applied. There is no server copy and
 * no API behind this page.
 */
export const STORAGE_KEY = "hotdash.product-roadmap.v1"

/** Where a saved copy that failed validation is kept, raw, so nothing is silently lost. */
export const REJECTED_KEY = `${STORAGE_KEY}.rejected`

export type LoadResult = {
  /** The valid saved copy, or `null` when there is none or it was refused. */
  state: RoadmapState | null
  /** The raw text of a copy that was present but refused; `null` otherwise. */
  rejected: string | null
}

/** Parses the raw text of a saved copy. Garbage and bad shapes are refused, never thrown. */
export function parseRaw(raw: string | null): LoadResult {
  if (raw === null || raw === "") return { state: null, rejected: null }
  try {
    const state = parseState(JSON.parse(raw))
    return state ? { state, rejected: null } : { state: null, rejected: raw }
  } catch {
    return { state: null, rejected: raw }
  }
}

export function loadState(storage: Storage | undefined): LoadResult {
  try {
    return parseRaw(storage?.getItem(STORAGE_KEY) ?? null)
  } catch {
    return { state: null, rejected: null }
  }
}

/**
 * Keeps a refused copy under the `.rejected` key before anything can
 * overwrite it, and says so in development. The board then shows the seed.
 */
export function quarantineRejected(storage: Storage | undefined, raw: string) {
  try {
    storage?.setItem(REJECTED_KEY, raw)
  } catch {
    // Nowhere to keep it; the warning below is all we can do.
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[product-roadmap] The saved copy under "${STORAGE_KEY}" failed validation and was not applied. ` +
        `It is kept raw under "${REJECTED_KEY}"; the board shows the sample bets instead.`
    )
  }
}

/** True when the copy is on disk. False on quota, private mode, or no storage at all. */
export function saveState(storage: Storage | undefined, state: RoadmapState): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState(storage: Storage | undefined): boolean {
  if (!storage) return false
  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ shell */

/**
 * Reducer state plus what we know about localStorage:
 * - `hydrated`: it has been consulted, the board may show real cards;
 * - `saved`: this browser holds a copy (one was found, or an edit was made);
 * - `dirty`: an edit was made since the last hydrate, so writes should flow;
 * - `saveFailed`: the last write did not land.
 * The seed is never written on its own: only a real edit makes `dirty` true.
 */
export type Shell = {
  data: RoadmapState
  hydrated: boolean
  saved: boolean
  dirty: boolean
  saveFailed: boolean
}

const EDITS: ReadonlySet<Action["type"]> = new Set(["add", "patch", "move", "reorder", "remove"])

export function shellReducer(shell: Shell, action: Action, nowMs: number): Shell {
  switch (action.type) {
    case "hydrate":
      return {
        data: reducer(shell.data, action, nowMs),
        hydrated: true,
        saved: action.state !== null,
        dirty: false,
        saveFailed: false,
      }
    case "reset":
      return {
        data: reducer(shell.data, action, nowMs),
        hydrated: shell.hydrated,
        saved: false,
        dirty: false,
        saveFailed: false,
      }
    case "save-result":
      return shell.saveFailed === !action.ok ? shell : { ...shell, saveFailed: !action.ok }
    default: {
      const data = reducer(shell.data, action, nowMs)
      // Only a change that actually changed something counts as an edit.
      if (data === shell.data || !EDITS.has(action.type)) return shell
      return { ...shell, data, saved: true, dirty: true }
    }
  }
}

export function initialShell(nowMs: number): Shell {
  return { data: seedState(nowMs), hydrated: false, saved: false, dirty: false, saveFailed: false }
}

/* ------------------------------------------------------------------ store */

export type Store = RoadmapState & {
  /** The request clock, read once in the page. Every date on the screen is relative to it. */
  nowMs: number
  /** True once localStorage has been read; the board can show real cards. */
  persisted: boolean
  /** True when this browser holds a saved copy (an edit was made, or one was found on load). */
  saved: boolean
  /** True when the last write to localStorage failed (quota, private mode). */
  saveFailed: boolean
  addItem: (input: NewItemInput) => void
  patchItem: (id: string, patch: ItemPatch) => void
  moveItem: (id: string, column: RoadmapColumn) => void
  reorderItem: (id: string, direction: -1 | 1) => void
  removeItem: (id: string) => void
  resetDemoData: () => void
}

const RoadmapContext = React.createContext<Store | null>(null)

export function RoadmapProvider({
  nowMs,
  children,
}: {
  /** Read once per request in `page.tsx`. The only clock this screen has. */
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(
    (s: Shell, a: Action) => shellReducer(s, a, nowMs),
    nowMs,
    initialShell
  )
  const { data, hydrated, saved, dirty, saveFailed } = shell

  // The server has no localStorage, so it renders with `hydrated: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — before the browser paints — so the
  // first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    const { state, rejected } = loadState(window.localStorage)
    if (rejected !== null) quarantineRejected(window.localStorage, rejected)
    dispatch({ type: "hydrate", state })
  }, [])

  // Another tab (or DevTools) changed our key: follow it, the same way a
  // load would. A removal means a reset elsewhere, so the seed comes back.
  React.useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.storageArea && event.storageArea !== window.localStorage) return
      if (event.key !== null && event.key !== STORAGE_KEY) return
      const { state, rejected } = parseRaw(event.key === null ? null : event.newValue)
      if (rejected !== null) quarantineRejected(window.localStorage, rejected)
      dispatch({ type: "hydrate", state })
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // Write only once there is something of the founder's to keep. Mount, a
  // copy found on load, and no-op edits all leave localStorage untouched.
  React.useEffect(() => {
    if (!hydrated || !dirty) return
    dispatch({ type: "save-result", ok: saveState(window.localStorage, data) })
  }, [hydrated, dirty, data])

  const value = React.useMemo<Store>(() => {
    const at = new Date(nowMs).toISOString()
    return {
      ...data,
      nowMs,
      persisted: hydrated,
      saved,
      saveFailed,
      addItem: (input) => dispatch({ type: "add", input, at }),
      patchItem: (id, patch) => dispatch({ type: "patch", id, patch, at }),
      moveItem: (id, column) => dispatch({ type: "move", id, column, at }),
      reorderItem: (id, direction) => dispatch({ type: "reorder", id, direction, at }),
      removeItem: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset" })
      },
    }
  }, [data, nowMs, hydrated, saved, saveFailed])

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>
}

export function useRoadmap() {
  const ctx = React.useContext(RoadmapContext)
  if (!ctx) throw new Error("useRoadmap must be used within a RoadmapProvider.")
  return ctx
}
