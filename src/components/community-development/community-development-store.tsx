"use client"

import * as React from "react"

import { todayIn, type IsoDay } from "@/lib/clock"
import {
  initiativeNumber,
  isInitiative,
  normalizeInput,
  sameInitiative,
  seedInitiatives,
  stripInitiative,
  type Initiative,
  type InitiativeInput,
  type InitiativeStatus,
} from "@/lib/community-development"
import {
  createStorage,
  dedupe,
  initialShell,
  isFiniteNumber,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
  type Storage,
} from "@/lib/persistence"

/**
 * What is saved. Deliberately no clock in here: `today` belongs to the
 * request, never to the copy, so two tabs serialise the same edits to the
 * same bytes and the shared `save` can skip an identical write.
 */
export type State = {
  initiatives: Initiative[]
  /** Next number for a generated initiative-n id. */
  nextId: number
}

export type Action =
  | { type: "add"; input: InitiativeInput }
  | { type: "update"; id: string; input: InitiativeInput }
  | { type: "set-status"; id: string; status: InitiativeStatus }
  | { type: "remove"; id: string }
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  | { type: "reset"; nowMs: number }

/** The list's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

/** The list's own transitions. Returns its input for a no-op, as the shared shell requires. */
export function reducer(state: State, action: EditAction): State {
  switch (action.type) {
    case "add": {
      const initiative: Initiative = {
        id: `initiative-${state.nextId}`,
        ...normalizeInput(action.input),
      }
      return { ...state, initiatives: [...state.initiatives, initiative], nextId: state.nextId + 1 }
    }

    case "update": {
      const current = state.initiatives.find((r) => r.id === action.id)
      if (!current) return state
      const next: Initiative = { id: current.id, ...normalizeInput(action.input) }
      if (sameInitiative(current, next)) return state
      return {
        ...state,
        initiatives: state.initiatives.map((r) => (r.id === action.id ? next : r)),
      }
    }

    case "set-status": {
      const current = state.initiatives.find((r) => r.id === action.id)
      if (!current || current.status === action.status) return state
      return {
        ...state,
        initiatives: state.initiatives.map((r) =>
          r.id === action.id ? { ...r, status: action.status } : r
        ),
      }
    }

    case "remove":
      if (!state.initiatives.some((r) => r.id === action.id)) return state
      return { ...state, initiatives: state.initiatives.filter((r) => r.id !== action.id) }
  }
}

type Shell = PersistenceShell<State>

/** The calendar day a shell measures from (America/Chicago). */
export const shellToday = (shell: Pick<Shell, "nowMs">): IsoDay => todayIn(new Date(shell.nowMs))

/** The seed around the day `nowMs` falls on. */
const seedAt = (nowMs: number) => initialState(todayIn(new Date(nowMs)))

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer(shell, {
        type: "hydrate",
        result: action.result,
        nowMs: action.nowMs,
        fallback: seedAt,
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, { type: "reset", nowMs: action.nowMs, seed: seedAt })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
  }
}

export function initialState(today: IsoDay): State {
  const initiatives = seedInitiatives(today)
  return { initiatives, nextId: highestId(initiatives) + 1 }
}

/** The highest numeric suffix among initiative-n ids; 0 when there are none. */
function highestId(rows: readonly Initiative[]) {
  return rows.reduce((max, r) => Math.max(max, initiativeNumber(r.id)), 0)
}

/* ------------------------------------------------------------ persistence */

/**
 * Initiatives are saved to this browser's localStorage under the shared
 * policy in `@/lib/persistence`: only after a real edit, validated whole
 * on load, Reset clears the key. Bump the version when the seed or shape
 * changes.
 */
export const STORAGE_KEY = "hotdash.community-development.v1"

/**
 * Every row is checked, not just the envelope: a bad type, an impossible
 * date, a duplicate id or an id counter that would collide all drop the
 * copy for the seed.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.initiatives) || !v.initiatives.every(isInitiative)) return false
  if (dedupe(v.initiatives.map((r) => r.id)).length !== v.initiatives.length) return false
  if (!isFiniteNumber(v.nextId) || !Number.isInteger(v.nextId)) return false
  if (v.nextId <= highestId(v.initiatives)) return false
  return true
}

/** Known keys only, at both levels; a saved copy's extras stop here. */
export function stripState(state: State): State {
  return { initiatives: state.initiatives.map(stripInitiative), nextId: state.nextId }
}

/** The storage `parse`: validate every row, then keep only the known keys. */
export function parseState(value: unknown): State | null {
  return isState(value) ? stripState(value) : null
}

export const communityDevelopmentStorage = createStorage<State>({
  key: STORAGE_KEY,
  parse: parseState,
})

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): State | null {
  return communityDevelopmentStorage.load(storage).state
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return communityDevelopmentStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  communityDevelopmentStorage.clear(storage)
}

type Store = State &
  PersistenceStore & {
    /**
     * Today on the founder's calendar (America/Chicago), from the shell's
     * clock: the request's instant until a Reset (ours, or another tab's)
     * moves it. The 30-day window, "done this year" and the add dialog's
     * default date all derive from it; nothing else in the tree reads a clock.
     */
    today: IsoDay
    addInitiative: (input: InitiativeInput) => void
    updateInitiative: (id: string, input: InitiativeInput) => void
    setStatus: (id: string, status: InitiativeStatus) => void
    removeInitiative: (id: string) => void
  }

const CommunityDevelopmentContext = React.createContext<Store | null>(null)

export function CommunityDevelopmentProvider({
  nowMs: requestNowMs,
  holdHydration = false,
  children,
}: {
  /** `now().getTime()` from the server component — the one clock read for the first hydrate. */
  nowMs: number
  /**
   * Review-only: skip reading localStorage so the page stays on its
   * skeleton (`?preview=skeleton`). Production never passes this.
   */
  holdHydration?: boolean
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, (ms) =>
    initialShell(seedAt(ms), ms)
  )
  const { data: state, persisted, edited, saved, saveFailed } = shell
  const today = shellToday(shell)

  // The server has no localStorage, so it renders with `persisted: false`
  // and the page shows skeletons. On the client the saved copy is read in a
  // layout effect — before paint — so the first frame is already the
  // founder's data, never a flash of seed. This first hydrate is the only
  // one dated from the request.
  React.useLayoutEffect(() => {
    if (holdHydration) return
    dispatch({
      type: "hydrate",
      result: communityDevelopmentStorage.load(window.localStorage),
      nowMs: requestNowMs,
    })
  }, [requestNowMs, holdHydration])

  const onHydrate = React.useCallback(
    (result: LoadResult<State>, nowMs: number) => dispatch({ type: "hydrate", result, nowMs }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: communityDevelopmentStorage, shell, onHydrate, onSaved })

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      today,
      persisted,
      edited,
      saved,
      saveFailed,
      addInitiative: (input) => dispatch({ type: "add", input }),
      updateInitiative: (id, input) => dispatch({ type: "update", id, input }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status }),
      removeInitiative: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }),
    [state, today, persisted, edited, saved, saveFailed]
  )

  return (
    <CommunityDevelopmentContext.Provider value={value}>
      {children}
    </CommunityDevelopmentContext.Provider>
  )
}

export function useCommunityDevelopment() {
  const ctx = React.useContext(CommunityDevelopmentContext)
  if (!ctx) {
    throw new Error("useCommunityDevelopment must be used within a CommunityDevelopmentProvider.")
  }
  return ctx
}
