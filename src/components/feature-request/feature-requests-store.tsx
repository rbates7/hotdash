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
import { buildSeed } from "@/lib/feature-requests/fixture"
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
  /** The key was cleared; re-seed from `nowMs` (`now()` at the click, via `reseedNowMs`). */
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
      // Rewriting the words makes the card the founder's; a sample tag on
      // text we did not write would be a lie.
      if (next.sample && (title !== target.title || ask !== target.ask)) delete next.sample
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
 * instant on mount, then the moment of a Reset or of a re-seed after another
 * tab's Reset. With no saved copy, hydrate falls back to a seed built lazily
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

/** The seed, dated from `now` — the request instant, never a client clock. */
export function initialState(now: Date): State {
  const requests = buildSeed(now)
  return { requests, nextId: requests.length + 1 }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage under the shared
 * policy in `@/lib/persistence`: only after a real edit (never the
 * untouched seed, never a hydrate), identical copies not re-written, every
 * item validated on load with a bad copy parked under `<key>.rejected`, a
 * write that can fail, other tabs heard, and Reset clearing the key. Bump
 * the version whenever the seed or the shape changes. There is no server
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

/** A copy with only the fields we know about; anything else is dropped. */
export function sanitize(state: State): State {
  return {
    nextId: state.nextId,
    requests: state.requests.map((r) => {
      const clean: FeatureRequest = {
        id: r.id,
        title: r.title,
        ask: r.ask,
        from: r.from,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
      if (r.sample === true) clean.sample = true
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
    /** The shell's clock as a Date: the request instant, or the last Reset. Relative labels measure from it. */
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
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed. The
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
  // re-seed after their Reset is dated from that moment. The result feeds
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
      // clock read): the browser returns to the never-edited state with a
      // seed dated from this moment, and the shell's clock moves with it.
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
