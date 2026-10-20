"use client"

import * as React from "react"

import { now as clockNow } from "@/lib/clock"
import {
  DEFAULT_FROM,
  LIMITS,
  isFeatureStatus,
  type FeatureRequest,
  type FeatureStatus,
} from "@/lib/feature-requests/feature-requests"
import { SEED_REQUEST_IDS } from "@/lib/feature-requests/seed-ids"
import {
  createStorage,
  initialShell,
  isIsoInstant,
  isString,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
} from "@/lib/persistence"

export type State = {
  requests: FeatureRequest[]
  /** Next number for a generated fr-n id. */
  nextId: number
}

export type NewRequestInput = {
  title: string
  ask?: string
  from?: string
  status?: FeatureStatus
}

/** The fields a founder can rewrite on an existing card. */
export type RequestPatch = Partial<Pick<FeatureRequest, "title" | "ask" | "from">>

/** What the founder can do to the board. `at` is the edit's own timestamp. */
export type EditAction =
  | { type: "add"; input: NewRequestInput; at: string }
  | { type: "patch"; id: string; patch: RequestPatch; at: string }
  | { type: "set-status"; id: string; status: FeatureStatus; at: string }
  | { type: "remove"; id: string }

export type Action =
  | EditAction
  /** localStorage was read: on mount (`nowMs` = the request's instant) or because another tab changed it (`nowMs` = `now()`). */
  | { type: "hydrate"; result: LoadResult<State>; nowMs: number }
  /** The key was cleared; empty the board at `nowMs` (`now()` at the click, via `reseedNowMs`). */
  | { type: "reset"; nowMs: number }
  | { type: "save-result"; ok: boolean }

const clip = (value: string, max: number) => value.trim().slice(0, max)

function clean(value: string | undefined, fallback: string, max: number): string {
  const trimmed = value === undefined ? "" : clip(value, max)
  return trimmed ? trimmed : fallback
}

export function reducer(state: State, action: EditAction): State {
  switch (action.type) {
    case "add": {
      const title = clip(action.input.title, LIMITS.title)
      if (!title) return state
      const request: FeatureRequest = {
        id: `fr-${state.nextId}`,
        title,
        ask: clip(action.input.ask ?? "", LIMITS.ask),
        from: clean(action.input.from, DEFAULT_FROM, LIMITS.from),
        status: action.input.status ?? "inbox",
        createdAt: action.at,
        updatedAt: action.at,
      }
      return {
        ...state,
        requests: [request, ...state.requests],
        nextId: state.nextId + 1,
      }
    }

    case "patch": {
      const target = state.requests.find((r) => r.id === action.id)
      if (!target) return state
      const title = clean(action.patch.title, target.title, LIMITS.title)
      const ask =
        action.patch.ask === undefined ? target.ask : clip(action.patch.ask, LIMITS.ask)
      const from = clean(action.patch.from, target.from, LIMITS.from)
      // A patch that changes nothing is not an edit: no updatedAt bump, no write.
      if (title === target.title && ask === target.ask && from === target.from) return state
      const next: FeatureRequest = { ...target, title, ask, from, updatedAt: action.at }
      return {
        ...state,
        requests: state.requests.map((r) => (r === target ? next : r)),
      }
    }

    case "set-status": {
      const target = state.requests.find((r) => r.id === action.id)
      if (!target || target.status === action.status) return state
      return {
        ...state,
        requests: state.requests.map((r) =>
          r === target ? { ...r, status: action.status, updatedAt: action.at } : r
        ),
      }
    }

    case "remove": {
      if (!state.requests.some((r) => r.id === action.id)) return state
      return {
        ...state,
        requests: state.requests.filter((r) => r.id !== action.id),
      }
    }
  }
}

/**
 * The shared persistence shell around the board (`@/lib/persistence`):
 * hydrates never count as edits and never write, a local unsaved edit wins
 * over an incoming copy, no-op edits return the same shell, `saved` follows
 * a write's result. The shell also holds the clock (`nowMs`): the request's
 * instant on mount, then the moment of a Clear or of another
 * tab's Clear. With no saved copy, hydrate falls back to an empty board
 * from that instant.
 */
type Shell = PersistenceShell<State>

const seedAt = (nowMs: number) => initialState(new Date(nowMs))

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
      return persistenceShellReducer(shell, {
        type: "edit",
        data: reducer(shell.data, action),
      })
  }
}

/**
 * A fresh board: no cards. No sample ideas, labelled or not (Rashad's Oct 16
 * rule). Ids start after the old sample's so a new idea never takes one of
 * theirs. `now` is unused, kept so the shell can pass its clock.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function initialState(_now: Date): State {
  return { requests: [], nextId: SEED_REQUEST_IDS.size + 1 }
}

/** A saved card that is still the old, untouched sample: one of its ids, saved with `sample: true`. */
function isOldSample(r: FeatureRequest) {
  return SEED_REQUEST_IDS.has(r.id) && (r as { sample?: unknown }).sample === true
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage under the shared
 * policy in `@/lib/persistence`: only after a real edit (never the
 * untouched empty board, never a hydrate), identical copies not re-written, every
 * item validated on load with a bad copy parked under `<key>.rejected`, a
 * write that can fail, other tabs heard, and Clear my entries clearing the key. Bump
 * the version whenever the shape changes. There is no server
 * copy and no API behind this page.
 */
export const STORAGE_KEY = "hotdash.feature-requests.v1"

const ID_PATTERN = /^fr-(\d+)$/

/** One saved card, checked field by field. Anything off and the whole copy is refused. */
export function isRequest(value: unknown): value is FeatureRequest {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    ID_PATTERN.test(v.id) &&
    isString(v.title) &&
    v.title.trim().length > 0 &&
    isString(v.ask) &&
    isString(v.from) &&
    v.from.trim().length > 0 &&
    isFeatureStatus(v.status) &&
    isIsoInstant(v.createdAt) &&
    isIsoInstant(v.updatedAt) &&
    // Copies saved before the sample was removed carry `sample: true` on
    // the untouched sample cards; `parseState` drops those.
    (v.sample === undefined || v.sample === true)
  )
}

export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.requests) || !v.requests.every(isRequest)) return false
  if (!Number.isInteger(v.nextId)) return false
  const ids = new Set<string>()
  let highest = 0
  for (const r of v.requests) {
    if (ids.has(r.id)) return false
    ids.add(r.id)
    highest = Math.max(highest, Number(ID_PATTERN.exec(r.id)![1]))
  }
  // The next id must be free: strictly above every id in use.
  return (v.nextId as number) > highest
}

/**
 * A copy with only the fields we know about; anything else is dropped,
 * and so is every card that is still the old untouched sample. The id
 * counter never moves back.
 */
export function sanitize(state: State): State {
  const kept = state.requests.filter((r) => !isOldSample(r))
  return {
    nextId: kept.length === state.requests.length ? state.nextId : Math.max(state.nextId, SEED_REQUEST_IDS.size + 1),
    requests: kept.map((r) => {
      const clean: FeatureRequest = {
        id: r.id,
        title: r.title,
        ask: r.ask,
        from: r.from,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
      return clean
    }),
  }
}

/** Validate every field, then keep only the fields we know about. */
export function parseState(value: unknown): State | null {
  return isState(value) ? sanitize(value) : null
}

/**
 * `State` carries no clock — the request instant lives in the provider —
 * so equal boards serialise equal across tabs and `save` can skip them.
 */
export const featureRequestsStorage = createStorage<State>({
  key: STORAGE_KEY,
  parse: parseState,
})

/** Where copies that failed validation are parked, newest first. */
export const REJECTED_KEY = featureRequestsStorage.rejectedKey

/* ------------------------------------------------------------------ store */

type Store = State &
  PersistenceStore & {
    /** `new Date(shell.nowMs)`: the request instant, or the last Clear. Relative labels measure from it. */
    now: Date
    addRequest: (input: NewRequestInput) => void
    patchRequest: (id: string, patch: RequestPatch) => void
    setStatus: (id: string, status: FeatureStatus) => void
    removeRequest: (id: string) => void
  }

const FeatureRequestsContext = React.createContext<Store | null>(null)

export function FeatureRequestsProvider({
  nowMs: requestNowMs,
  children,
}: {
  /** `now().getTime()` from the server component rendering this page — the first hydrate's clock. */
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, requestNowMs, (ms) =>
    initialShell(seedAt(ms), ms)
  )
  const { data: state, nowMs, persisted, edited, saved, saveFailed } = shell

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than an empty board. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never a flash of the empty board. The
  // request instant is used here, and only here.
  React.useLayoutEffect(() => {
    dispatch({
      type: "hydrate",
      result: featureRequestsStorage.load(window.localStorage),
      nowMs: requestNowMs,
    })
  }, [requestNowMs])

  // Other tabs and writes, the shared way: a hydrate never writes; only a
  // moving edit count does. A cross-tab event arrives with `now()` so a
  // empty board after their Clear is dated from that moment. The result feeds
  // the note.
  const onHydrate = React.useCallback(
    (result: LoadResult<State>, at: number) => dispatch({ type: "hydrate", result, nowMs: at }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: featureRequestsStorage, shell, onHydrate, onSaved })

  const now = React.useMemo(() => new Date(nowMs), [nowMs])

  const value = React.useMemo<Store>(() => {
    // Edit timestamps come from the one clock at the moment of the edit,
    // never a bare `new Date()` and never the request instant.
    const at = () => clockNow().toISOString()
    return {
      ...state,
      now,
      persisted,
      edited,
      saved,
      saveFailed,
      addRequest: (input) => dispatch({ type: "add", input, at: at() }),
      patchRequest: (id, patch) => dispatch({ type: "patch", id, patch, at: at() }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status, at: at() }),
      removeRequest: (id) => dispatch({ type: "remove", id }),
      // Clear first, then regenerate from right now (the shared post-mount
      // clock read): the browser returns to the never-edited state with an
      // empty board dated from this moment, and the shell's clock moves with it.
      resetDemoData: () => {
        featureRequestsStorage.clear(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }
  }, [state, now, persisted, edited, saved, saveFailed])

  return (
    <FeatureRequestsContext.Provider value={value}>
      {children}
    </FeatureRequestsContext.Provider>
  )
}

export function useFeatureRequests() {
  const ctx = React.useContext(FeatureRequestsContext)
  if (!ctx) {
    throw new Error("useFeatureRequests must be used within a FeatureRequestsProvider.")
  }
  return ctx
}
