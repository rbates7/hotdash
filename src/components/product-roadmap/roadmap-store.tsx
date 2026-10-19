"use client"

import * as React from "react"

import { now } from "@/lib/clock"
import { notionFeedOf, type LiveRoadmap } from "@/lib/notion-roadmap"
import {
  createStorage,
  initialShell,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
} from "@/lib/persistence"
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
import { useNotionRoadmapView } from "@/hooks/use-notion-roadmap"

export type NewItemInput = {
  title: string
  why?: string
  owner?: RoadmapOwner
  window?: string
  column?: RoadmapColumn
}

/** The fields a founder can rewrite on an existing bet. */
export type ItemPatch = Partial<Pick<RoadmapItem, "title" | "why" | "owner" | "window">>

/** The screen's own edits. Every one carries the instant it was made (`now()`). */
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
 * in here reads `Date`: the `at` stamp comes from the provider, read from
 * the shared clock at the moment of the edit.
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
 * persistence helper — from the first real edit on, never on mount, never
 * because another tab wrote. Bump the version whenever the shape changes so
 * stale saves are discarded instead of half-applied. This is the board
 * while Notion is not connected; it starts empty (no sample bets — the
 * fixture in `@/lib/roadmap/fixture` is for tests only).
 */
export const STORAGE_KEY = "hotdash.product-roadmap.v1"

/** Where saved copies that failed validation are parked, raw (last three). */
export const REJECTED_KEY = `${STORAGE_KEY}.rejected`

/**
 * `parse` is the screen's validator proper: every item field-checked, ids
 * unique, `nextId` above every id, unknown keys stripped — one bad item and
 * the whole copy is refused (parked under `REJECTED_KEY`, empty board
 * shown). Bets still tagged sample (a copy saved before #45 dropped the
 * sample board, with the untouched sample bets in it) are left out: no
 * sample bet is ever shown.
 */
export function parseSavedBoard(value: unknown): RoadmapState | null {
  const state = parseState(value)
  if (!state || !state.items.some((i) => i.sample)) return state
  return { ...state, items: state.items.filter((i) => !i.sample) }
}

export const roadmapStorage = createStorage<RoadmapState>({
  key: STORAGE_KEY,
  parse: parseSavedBoard,
})

/** The board with nothing saved: empty, never sample bets. */
export function emptyBoard(): RoadmapState {
  return { items: [], nextId: 1 }
}

let startingBoard: (nowMs: number) => RoadmapState = emptyBoard

/**
 * Tests (and only tests): what the board starts from with nothing saved,
 * e.g. the fixture in `@/lib/roadmap/fixture`, so the editing tests have
 * bets to move. The app never calls this; the test setup puts the empty
 * board back after each test.
 */
export function configureRoadmapBoard(start: ((nowMs: number) => RoadmapState) | null) {
  startingBoard = start ?? emptyBoard
}

export const loadState = roadmapStorage.load
export const saveState = roadmapStorage.save
export const clearState = roadmapStorage.clear

/* ------------------------------------------------------------------ shell */

export type Shell = PersistenceShell<RoadmapState>

export type Action =
  | Edit
  /** `nowMs` is the request's instant on mount, `now()` for a cross-tab event. */
  | { type: "hydrate"; result: LoadResult<RoadmapState>; nowMs: number }
  /** `nowMs` is `now()` at the click (`reseedNowMs`), never the request's. */
  | { type: "reset"; nowMs: number }
  | { type: "save-result"; ok: boolean }

/**
 * Routes every action through the shared shell: hydrate / reset / save
 * results are the shared transitions; a screen edit becomes a shared `edit`
 * event carrying the reducer's output, so a no-op (same object back) leaves
 * the shell untouched — nothing marked edited, no write. With nothing
 * saved (first visit, a Reset, another tab's Reset) the board is empty.
 */
export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        nowMs: action.nowMs,
        fallback: startingBoard,
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", nowMs: action.nowMs, seed: startingBoard })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
  }
}

export function initialRoadmapShell(nowMs: number): Shell {
  return initialShell(startingBoard(nowMs), nowMs)
}

/* ------------------------------------------------------------------ store */

/** Notion's rows while it is connected (or stale), shown read-only. */
export type LiveBoard = LiveRoadmap & { stale: boolean; lastSyncedAt: Date }

export type Store = RoadmapState &
  PersistenceStore & {
    /**
     * Where the board comes from: `loading` until Notion's first answer
     * (skeleton); `connecting` while the server's first Notion sync runs
     * (skeleton plus "Connecting to Notion…", never sample bets); `local`
     * when Notion is not connected (this browser's own bets, empty to start,
     * shown under a Not connected notice); or `notion` (read-only).
     */
    source: "loading" | "connecting" | "local" | "notion"
    /** Notion's rows when `source` is `notion`, else null. */
    live: LiveBoard | null
    /** True while Notion is the source: every edit below is a no-op. */
    readOnly: boolean
    /**
     * The instant the screen measures from: the request's on first render,
     * then the moment of a Reset (or of a re-seed after another tab's Reset).
     */
    nowMs: number
    addItem: (input: NewItemInput) => void
    patchItem: (id: string, patch: ItemPatch) => void
    moveItem: (id: string, column: RoadmapColumn) => void
    reorderItem: (id: string, direction: -1 | 1) => void
    removeItem: (id: string) => void
  }

const RoadmapContext = React.createContext<Store | null>(null)

export function RoadmapProvider({
  nowMs: requestNowMs,
  children,
}: {
  /** `now().getTime()` from the server component — the one clock read for the first hydrate. */
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, initialRoadmapShell)
  const { data, nowMs, persisted, edited, saved, saveFailed } = shell
  const view = useNotionRoadmapView()

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than an empty board. On the client the saved
  // copy is read in a *layout* effect — before the browser paints — so the
  // first frame a user sees is already their data. This
  // first hydrate is the only one dated from the request.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", result: roadmapStorage.load(window.localStorage), nowMs: requestNowMs })
  }, [requestNowMs])

  // Other tabs and writes, the shared way: a hydrate never writes (another
  // tab's copy is theirs; their Reset empties this tab, dated from the
  // `now()` the hook reads); only a moving edit count does, and an identical
  // copy is never re-written. The write's result feeds the note.
  const onHydrate = React.useCallback(
    (result: LoadResult<RoadmapState>, at: number) => dispatch({ type: "hydrate", result, nowMs: at }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: roadmapStorage, shell, onHydrate, onSaved })

  // Notion, when connected, is the roadmap: shown read-only, never mixed
  // with this browser's edits (they stay saved here, untouched, and come
  // back if Notion is disconnected). See docs/notion-roadmap.md.
  const feed = React.useMemo(() => notionFeedOf(view), [view])
  const live = React.useMemo<LiveBoard | null>(
    () => (feed.kind === "live" ? { ...feed.roadmap, stale: feed.stale, lastSyncedAt: feed.lastSyncedAt } : null),
    [feed]
  )
  const source: Store["source"] =
    feed.kind === "loading" ? (feed.connecting ? "connecting" : "loading") : live ? "notion" : "local"
  const readOnly = source !== "local"

  const value = React.useMemo<Store>(() => {
    // Edits are stamped at the moment they happen, through the shared clock.
    const at = () => now().toISOString()
    const edit = (action: () => void) => {
      if (!readOnly) action()
    }
    return {
      ...data,
      nowMs,
      persisted,
      edited,
      saved,
      saveFailed,
      source,
      live,
      readOnly,
      addItem: (input) => edit(() => dispatch({ type: "add", input, at: at() })),
      patchItem: (id, patch) => edit(() => dispatch({ type: "patch", id, patch, at: at() })),
      moveItem: (id, column) => edit(() => dispatch({ type: "move", id, column, at: at() })),
      reorderItem: (id, direction) => edit(() => dispatch({ type: "reorder", id, direction, at: at() })),
      removeItem: (id) => edit(() => dispatch({ type: "remove", id })),
      resetDemoData: () => {
        if (readOnly) return
        // Clear first, then regenerate from the moment of the click (the
        // shared clock read every store uses for a reset): the browser
        // returns to the never-edited state: an empty board.
        roadmapStorage.clear(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }
  }, [data, nowMs, persisted, edited, saved, saveFailed, source, live, readOnly])

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>
}

export function useRoadmap() {
  const ctx = React.useContext(RoadmapContext)
  if (!ctx) throw new Error("useRoadmap must be used within a RoadmapProvider.")
  return ctx
}
