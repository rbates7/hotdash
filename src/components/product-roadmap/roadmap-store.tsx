"use client"

import * as React from "react"

import {
  createStorage,
  initialShell,
  persistenceShellReducer,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
} from "@/lib/persistence"
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

/** The screen's own edits. Every one carries the request-clock stamp. */
export type Edit =
  | { type: "add"; input: NewItemInput; at: string }
  | { type: "patch"; id: string; patch: ItemPatch; at: string }
  | { type: "move"; id: string; column: RoadmapColumn; at: string }
  | { type: "reorder"; id: string; direction: -1 | 1; at: string }
  | { type: "remove"; id: string }

function text(value: string | undefined, max: number): string | undefined {
  return value === undefined ? undefined : value.trim().slice(0, max)
}

/**
 * Pure. Every edit that changes nothing returns the *same* state object, so
 * the shared persistence shell can tell a real edit from a no-op without
 * diffing — and `updatedAt` is only ever stamped on a real change. Nothing
 * in here reads `Date`: the `at` stamp comes from the provider, which
 * derives it from the request clock.
 */
export function reducer(state: RoadmapState, edit: Edit): RoadmapState {
  switch (edit.type) {
    case "add": {
      const title = text(edit.input.title, MAX_TITLE)
      if (!title) return state
      const column = edit.input.column ?? "later"
      const item: RoadmapItem = {
        id: `rm-${state.nextId}`,
        title,
        why: text(edit.input.why, MAX_WHY) ?? "",
        owner: edit.input.owner ?? DEFAULT_OWNER,
        window: text(edit.input.window, MAX_WINDOW) ?? "",
        column,
        order: inColumn(state.items, column).length,
        linkedTickets: 0,
        signedAt: edit.at,
        updatedAt: edit.at,
      }
      return { items: [...state.items, item], nextId: state.nextId + 1 }
    }

    case "patch": {
      const target = state.items.find((i) => i.id === edit.id)
      if (!target) return state
      const title = text(edit.patch.title, MAX_TITLE)
      const next: RoadmapItem = {
        ...target,
        // A blank title is not an edit; keep the one we have.
        title: title ? title : target.title,
        why: text(edit.patch.why, MAX_WHY) ?? target.why,
        window: text(edit.patch.window, MAX_WINDOW) ?? target.window,
        owner: edit.patch.owner ?? target.owner,
      }
      const rewritten =
        next.title !== target.title || next.why !== target.why || next.window !== target.window
      if (!rewritten && next.owner === target.owner) return state
      // Rewriting the words makes the bet the founder's; a sample tag on
      // text we did not write would be a lie. Re-owning keeps the tag.
      if (rewritten && next.sample) delete next.sample
      next.updatedAt = edit.at
      return { ...state, items: state.items.map((i) => (i === target ? next : i)) }
    }

    case "move": {
      const target = state.items.find((i) => i.id === edit.id)
      if (!target || target.column === edit.column) return state
      const from = target.column
      const moved: RoadmapItem = {
        ...target,
        column: edit.column,
        order: inColumn(state.items, edit.column).length,
        updatedAt: edit.at,
      }
      const items = state.items.map((i) => (i === target ? moved : i))
      return { ...state, items: normalizeColumn(items, from) }
    }

    case "reorder": {
      const target = state.items.find((i) => i.id === edit.id)
      if (!target) return state
      const ordered = inColumn(state.items, target.column)
      const index = ordered.findIndex((i) => i.id === target.id)
      const swapWith = index + edit.direction
      if (swapWith < 0 || swapWith >= ordered.length) return state
      const position = new Map(ordered.map((item, i) => [item.id, i]))
      position.set(target.id, swapWith)
      position.set(ordered[swapWith].id, index)
      return {
        ...state,
        items: state.items.map((i) => {
          const order = position.get(i.id)
          if (order === undefined || order === i.order) return i
          return i.id === target.id ? { ...i, order, updatedAt: edit.at } : { ...i, order }
        }),
      }
    }

    case "remove": {
      const target = state.items.find((i) => i.id === edit.id)
      if (!target) return state
      return {
        ...state,
        items: normalizeColumn(
          state.items.filter((i) => i !== target),
          target.column
        ),
      }
    }
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage through the shared
 * persistence helper — from the first real edit on, never the untouched
 * seed, never on mount, never because another tab wrote. Bump the version
 * whenever the seed or the shape changes so stale saves are discarded
 * instead of half-applied. There is no server copy and no API behind this
 * page.
 */
export const STORAGE_KEY = "hotdash.product-roadmap.v1"

/** Where saved copies that failed validation are parked, raw (last three). */
export const REJECTED_KEY = `${STORAGE_KEY}.rejected`

/**
 * `parse` is the screen's validator proper: every item field-checked, ids
 * unique, `nextId` above every id, unknown keys stripped — one bad item and
 * the whole copy is refused (parked under `REJECTED_KEY`, seed shown).
 */
export const roadmapStorage = createStorage<RoadmapState>({
  key: STORAGE_KEY,
  parse: parseState,
})

export const loadState = roadmapStorage.load
export const saveState = roadmapStorage.save
export const clearState = roadmapStorage.clear

/* ------------------------------------------------------------------ shell */

export type Shell = PersistenceShell<RoadmapState>

export type Action =
  | Edit
  | { type: "hydrate"; result: LoadResult<RoadmapState> }
  | { type: "reset" }
  | { type: "save-result"; ok: boolean }

/**
 * Routes every action through the shared shell: hydrate / reset / save
 * results are the shared transitions; a screen edit becomes a shared `edit`
 * event carrying the reducer's output, so a no-op (same object back) leaves
 * the shell untouched — nothing marked edited, no write. The seed, for a
 * hydrate with nothing saved and for Reset, is rebuilt from the request
 * clock, never from a client read.
 */
export function shellReducer(shell: Shell, action: Action, nowMs: number): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        fallback: seedState(nowMs),
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", data: seedState(nowMs) })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
  }
}

export function initialRoadmapShell(nowMs: number): Shell {
  return initialShell(seedState(nowMs))
}

/* ------------------------------------------------------------------ store */

export type Store = RoadmapState &
  PersistenceStore & {
    /** The request clock, read once in the page. Every date on the screen is relative to it. */
    nowMs: number
    addItem: (input: NewItemInput) => void
    patchItem: (id: string, patch: ItemPatch) => void
    moveItem: (id: string, column: RoadmapColumn) => void
    reorderItem: (id: string, direction: -1 | 1) => void
    removeItem: (id: string) => void
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
    initialRoadmapShell
  )
  const { data, persisted, edited, saved, saveFailed } = shell

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — before the browser paints — so the
  // first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: roadmapStorage.load(window.localStorage) })
  }, [])

  // Other tabs and writes, the shared way: a hydrate never writes (another
  // tab's copy is theirs; their Reset re-seeds this tab); only a moving edit
  // count does, and an identical copy is never re-written. The write's
  // result feeds the note.
  const onHydrate = React.useCallback(
    (result: LoadResult<RoadmapState>) => dispatch({ type: "hydrate", result }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: roadmapStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(() => {
    const at = new Date(nowMs).toISOString()
    return {
      ...data,
      nowMs,
      persisted,
      edited,
      saved,
      saveFailed,
      addItem: (input) => dispatch({ type: "add", input, at }),
      patchItem: (id, patch) => dispatch({ type: "patch", id, patch, at }),
      moveItem: (id, column) => dispatch({ type: "move", id, column, at }),
      reorderItem: (id, direction) => dispatch({ type: "reorder", id, direction, at }),
      removeItem: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        // Clear first, then regenerate around the request clock — never a
        // client read, per the read-once rule.
        roadmapStorage.clear(window.localStorage)
        dispatch({ type: "reset" })
      },
    }
  }, [data, nowMs, persisted, edited, saved, saveFailed])

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>
}

export function useRoadmap() {
  const ctx = React.useContext(RoadmapContext)
  if (!ctx) throw new Error("useRoadmap must be used within a RoadmapProvider.")
  return ctx
}
