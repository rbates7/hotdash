"use client"

import * as React from "react"

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
  isIsoInstant,
  isString,
  type LoadResult,
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

export type Action =
  | { type: "add"; input: NewRequestInput; at: string }
  | { type: "patch"; id: string; patch: RequestPatch; at: string }
  | { type: "set-status"; id: string; status: FeatureStatus; at: string }
  | { type: "remove"; id: string }
  /** The saved copy as read on mount, or as another tab just left it. */
  | { type: "hydrate"; result: LoadResult<State> }
  | { type: "reset"; at: string }
  /** Outcome of the last write attempt. */
  | { type: "wrote"; ok: boolean }

const clip = (value: string, max: number) => value.trim().slice(0, max)

function clean(value: string | undefined, fallback: string, max: number): string {
  const trimmed = value === undefined ? "" : clip(value, max)
  return trimmed ? trimmed : fallback
}

export function reducer(state: State, action: Action): State {
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

    case "hydrate":
      // With no copy the shell swaps in a fresh seed; it knows the instant.
      return action.result.state ? sanitize(action.result.state) : state

    case "reset":
      return initialState(new Date(action.at))

    case "wrote":
      return state
  }
}

const EDITS: ReadonlySet<Action["type"]> = new Set(["add", "patch", "set-status", "remove"])

/**
 * Reducer state plus persistence bookkeeping, in the shape the shared
 * `PersistenceNote` reads (`PersistenceStatus`) plus two of our own:
 *
 * - `nowIso`: the request instant from the page. Every stamp on a card and
 *   the seed's dates come from it; nothing in here reads the clock.
 * - `pending`: user edits since the last write/hydrate/reset. Only a
 *   positive count triggers a write, so neither the untouched seed nor a
 *   copy that was merely loaded (or synced from another tab) is ever
 *   written back.
 */
type Shell = {
  data: State
  nowIso: string
  hydrated: boolean
  edited: boolean
  saved: boolean
  pending: number
  saveFailed: boolean
}

function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      // A copy (ours from an earlier session, or another tab's) is theirs:
      // nothing new of ours to save, so `pending` drops to zero and nothing
      // is written back. An empty or removed key re-seeds this tab and
      // forgets that anything was edited here.
      return {
        ...shell,
        data: action.result.state
          ? sanitize(action.result.state)
          : initialState(new Date(shell.nowIso)),
        hydrated: true,
        edited: action.result.state ? shell.edited : false,
        saved: action.result.status === "saved",
        pending: 0,
        saveFailed: false,
      }
    case "reset":
      return {
        ...shell,
        data: initialState(new Date(shell.nowIso)),
        edited: false,
        saved: false,
        pending: 0,
        saveFailed: false,
      }
    case "wrote":
      return {
        ...shell,
        saved: shell.saved || action.ok,
        pending: action.ok ? 0 : shell.pending,
        saveFailed: !action.ok,
      }
    default: {
      const data = reducer(shell.data, action)
      // Only a change that actually changed something counts as an edit.
      const changed = EDITS.has(action.type) && data !== shell.data
      return changed ? { ...shell, data, edited: true, pending: shell.pending + 1 } : shell
    }
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
 * untouched seed), validated whole on load with a bad copy parked under
 * `<key>.rejected`, a write that can fail, other tabs heard, and Reset
 * clearing the key. Bump the version whenever the seed or the shape
 * changes. There is no server copy and no API behind this page.
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

export const featureRequestsStorage = createStorage<State>({
  key: STORAGE_KEY,
  validate: isState,
})

/** Where a copy that failed validation is parked, verbatim. */
export const REJECTED_KEY = featureRequestsStorage.rejectedKey

/* ------------------------------------------------------------------ store */

type Store = State &
  PersistenceStore & {
    /** The request instant, as a Date. Every relative label is measured from it. */
    now: Date
    addRequest: (input: NewRequestInput) => void
    patchRequest: (id: string, patch: RequestPatch) => void
    setStatus: (id: string, status: FeatureStatus) => void
    removeRequest: (id: string) => void
  }

const FeatureRequestsContext = React.createContext<Store | null>(null)

export function FeatureRequestsProvider({
  nowMs,
  children,
}: {
  /** `now().getTime()` from the server component rendering this page. */
  nowMs: number
  children: React.ReactNode
}) {
  const [shell, dispatch] = React.useReducer(shellReducer, nowMs, (ms): Shell => ({
    data: initialState(new Date(ms)),
    nowIso: new Date(ms).toISOString(),
    hydrated: false,
    edited: false,
    saved: false,
    pending: 0,
    saveFailed: false,
  }))
  const { data: state, nowIso, hydrated: persisted, edited, saved, pending, saveFailed } = shell

  // The JSON last known to be in storage (written by us, or read from it).
  // Writes compare against it so a round of hydrate → re-render can never
  // put back what is already there — two tabs would otherwise ping-pong.
  const lastWritten = React.useRef<string | null>(null)
  const hydrate = React.useCallback((result: LoadResult<State>) => {
    lastWritten.current = result.state ? JSON.stringify(sanitize(result.state)) : null
    dispatch({ type: "hydrate", result })
  }, [])

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    hydrate(featureRequestsStorage.load(window.localStorage))
  }, [hydrate])

  // Another tab wrote or cleared the key: take its copy rather than
  // overwriting it with ours on the next edit. A hydrate never saves.
  React.useEffect(() => featureRequestsStorage.subscribe(hydrate), [hydrate])

  // Write only while user edits are pending, and only if the JSON actually
  // differs from what storage holds. A load with no edits writes nothing
  // back; the untouched seed is never written at all. The copy carries no
  // clock (`nowIso` lives outside `State`), so equal boards serialise equal.
  React.useEffect(() => {
    if (!persisted || pending === 0) return
    const json = JSON.stringify(state)
    if (json === lastWritten.current) {
      dispatch({ type: "wrote", ok: true })
      return
    }
    const ok = featureRequestsStorage.save(window.localStorage, state)
    if (ok) lastWritten.current = json
    dispatch({ type: "wrote", ok })
  }, [persisted, pending, state])

  const now = React.useMemo(() => new Date(nowIso), [nowIso])

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      now,
      persisted,
      edited,
      saved,
      saveFailed,
      // Every stamp is the request instant: no client clock reads here.
      addRequest: (input) => dispatch({ type: "add", input, at: nowIso }),
      patchRequest: (id, patch) => dispatch({ type: "patch", id, patch, at: nowIso }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status, at: nowIso }),
      removeRequest: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        featureRequestsStorage.clear(window.localStorage)
        lastWritten.current = null
        dispatch({ type: "reset", at: nowIso })
      },
    }),
    [state, now, nowIso, persisted, edited, saved, saveFailed]
  )

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
