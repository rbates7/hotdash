"use client"

import * as React from "react"

import {
  createStorage,
  initialShell,
  persistenceShellReducer,
  type LoadResult,
  type PersistenceEvent,
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
 * seed, never on mount. Bump the version whenever the seed or the shape
 * changes so stale saves are discarded instead of half-applied. There is no
 * server copy and no API behind this page.
 */
export const STORAGE_KEY = "hotdash.product-roadmap.v1"

/** Where a saved copy that failed validation is kept, raw, so nothing is silently lost. */
export const REJECTED_KEY = `${STORAGE_KEY}.rejected`

/** The shared helper wants a type guard; the validator proper is `parseState`. */
export function isRoadmapState(value: unknown): value is RoadmapState {
  return parseState(value) !== null
}

export const roadmapStorage = createStorage<RoadmapState>({
  key: STORAGE_KEY,
  validate: isRoadmapState,
})

/**
 * A loaded copy, re-run through `parseState` so what reaches the board holds
 * only the known fields (the shared helper hands back the parsed JSON as is).
 */
export function normalizeLoad(result: LoadResult<RoadmapState>): LoadResult<RoadmapState> {
  if (result.status !== "saved") return result
  const state = parseState(result.state)
  return state ? { state, status: "saved" } : { state: null, status: "rejected" }
}

export const loadState = (storage: Storage | undefined) => normalizeLoad(roadmapStorage.load(storage))
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
 * the shell untouched — nothing marked edited, nothing written.
 */
export function shellReducer(shell: Shell, action: Action, nowMs: number): Shell {
  let event: PersistenceEvent<RoadmapState>
  switch (action.type) {
    case "hydrate":
      event = { type: "hydrate", result: normalizeLoad(action.result), fallback: seedState(nowMs) }
      break
    case "reset":
      event = { type: "reset", data: seedState(nowMs) }
      break
    case "save-result":
      event = action
      break
    default:
      event = { type: "edit", data: reducer(shell.data, action) }
  }
  return persistenceShellReducer(shell, event)
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

  // The JSON last seen on disk — loaded or written by us. A write that would
  // put back exactly what is there is skipped, so two tabs can never
  // ping-pong, and a hydrate can never be mistaken for something to save.
  const onDisk = React.useRef<string | null>(null)

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — before the browser paints — so the
  // first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    const result = roadmapStorage.load(window.localStorage)
    onDisk.current = result.status === "saved" ? JSON.stringify(result.state) : null
    dispatch({ type: "hydrate", result })
  }, [])

  // Another tab (or DevTools) changed our key: follow it, the same way a
  // load would. A removal means a reset elsewhere, so the seed comes back
  // and this tab is no longer "edited" — nothing is written back either way.
  React.useEffect(
    () =>
      roadmapStorage.subscribe((result) => {
        onDisk.current = result.status === "saved" ? JSON.stringify(result.state) : null
        dispatch({ type: "hydrate", result })
      }),
    []
  )

  // Write only once there is something of the founder's to keep. Mount, a
  // copy found on load, a copy taken from another tab, and no-op edits all
  // leave localStorage untouched.
  React.useEffect(() => {
    if (!persisted || !edited) return
    const json = JSON.stringify(data)
    if (json === onDisk.current) return
    const ok = roadmapStorage.save(window.localStorage, data)
    if (ok) onDisk.current = json
    dispatch({ type: "save-result", ok })
  }, [persisted, edited, data])

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
        roadmapStorage.clear(window.localStorage)
        onDisk.current = null
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
