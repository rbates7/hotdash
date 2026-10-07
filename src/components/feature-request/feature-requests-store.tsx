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
  /** First read of localStorage after mount. */
  | { type: "hydrate"; state: State | null }
  /** Another tab changed (or removed) the saved copy. */
  | { type: "sync"; state: State | null }
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
    case "sync":
      // A null copy on `sync` means the other tab reset; the provider's
      // shell swaps in a fresh seed because it knows the request instant.
      return action.state ?? state

    case "reset":
      return initialState(new Date(action.at))

    case "wrote":
      return state
  }
}

const EDITS: ReadonlySet<Action["type"]> = new Set(["add", "patch", "set-status", "remove"])

/**
 * Reducer state plus persistence bookkeeping.
 *
 * - `nowIso`: the request instant from the page. Every stamp on a card and
 *   the seed's dates come from it; nothing in here reads the clock.
 * - `hydrated`: localStorage has been consulted; real cards may render.
 * - `saved`: this browser holds a saved copy (found on load, or written).
 * - `pending`: user edits since the last write/hydrate/sync/reset. Only a
 *   positive count triggers a write, so neither the untouched seed nor a
 *   copy that was merely loaded is ever written back.
 * - `saveFailed`: the last write threw (quota, private mode).
 */
type Shell = {
  data: State
  nowIso: string
  hydrated: boolean
  saved: boolean
  pending: number
  saveFailed: boolean
}

function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return {
        ...shell,
        data: action.state ?? shell.data,
        hydrated: true,
        saved: action.state !== null,
        pending: 0,
        saveFailed: false,
      }
    case "sync":
      return {
        ...shell,
        data: action.state ?? initialState(new Date(shell.nowIso)),
        saved: action.state !== null,
        pending: 0,
        saveFailed: false,
      }
    case "reset":
      return {
        ...shell,
        data: initialState(new Date(shell.nowIso)),
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
      const edited = EDITS.has(action.type) && data !== shell.data
      return edited ? { ...shell, data, pending: shell.pending + 1 } : shell
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
 * Board state is saved to this browser's localStorage — from the first real
 * edit on, never the untouched seed — so a reload keeps Dan's ideas. Bump
 * the version whenever the seed or the shape changes so stale saves are
 * discarded instead of half-applied. There is no server copy and no API
 * behind this page.
 */
export const STORAGE_KEY = "hotdash.feature-requests.v1"

/**
 * Where a saved copy that failed validation is parked, verbatim, before
 * anything can overwrite the live key. Nothing of the founder's is lost
 * silently; it is just not rendered.
 */
export const REJECTED_KEY = `${STORAGE_KEY}.rejected`

const isString = (v: unknown): v is string => typeof v === "string"

/** Exact ISO round trip: `Date.parse("0")` is a date, `"0"` is not an ISO stamp. */
const isIsoInstant = (v: unknown): v is string => {
  if (!isString(v)) return false
  const t = Date.parse(v)
  return !Number.isNaN(t) && new Date(t).toISOString() === v
}

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
function sanitize(state: State): State {
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

/**
 * The saved copy, or `null` when there is none or any part of it is bad —
 * the caller then falls back to the seed rather than half-applying it. A
 * bad copy is parked under `REJECTED_KEY` first so it cannot be lost when
 * the next edit writes the live key.
 */
export function loadState(storage: Storage | undefined): State | null {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isState(parsed)) return sanitize(parsed)
  } catch {
    // Fall through: unreadable storage or unparseable JSON is a rejection too.
  }
  if (raw !== null) stashRejected(storage, raw)
  return null
}

function stashRejected(storage: Storage | undefined, raw: string) {
  try {
    storage?.setItem(REJECTED_KEY, raw)
  } catch {
    // Nowhere to park it; the warning below is all we can do.
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[feature-request] The saved copy under ${STORAGE_KEY} failed validation and was not applied. ` +
        `It is kept verbatim under ${REJECTED_KEY}; the board shows the sample seed instead.`
    )
  }
}

/** True when the write landed. False on quota, private mode, or no storage. */
export function saveState(storage: Storage | undefined, state: State): boolean {
  try {
    if (!storage) return false
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearState(storage: Storage | undefined) {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the next load falls back to the seed anyway.
  }
}

/* ------------------------------------------------------------------ store */

type Store = State & {
  /** The request instant, as a Date. Every relative label is measured from it. */
  now: Date
  /** True once localStorage has been read; the board can show real cards. */
  persisted: boolean
  /** True when this browser holds a saved copy (an edit was written, or one was found on load). */
  saved: boolean
  /** True when the last write failed; edits still work for the session. */
  saveFailed: boolean
  addRequest: (input: NewRequestInput) => void
  patchRequest: (id: string, patch: RequestPatch) => void
  setStatus: (id: string, status: FeatureStatus) => void
  removeRequest: (id: string) => void
  resetDemoData: () => void
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
    saved: false,
    pending: 0,
    saveFailed: false,
  }))
  const { data: state, nowIso, hydrated: persisted, saved, pending, saveFailed } = shell

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", state: loadState(window.localStorage) })
  }, [])

  // Write only when there are edits waiting. A load with no edits writes
  // nothing back; the untouched seed is never written at all.
  React.useEffect(() => {
    if (!persisted || pending === 0) return
    dispatch({ type: "wrote", ok: saveState(window.localStorage, state) })
  }, [persisted, pending, state])

  // Another tab edited or reset the board: follow it.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return
      if (event.key !== null && event.key !== STORAGE_KEY) return
      dispatch({ type: "sync", state: loadState(window.localStorage) })
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const now = React.useMemo(() => new Date(nowIso), [nowIso])

  const value = React.useMemo<Store>(
    () => ({
      ...state,
      now,
      persisted,
      saved,
      saveFailed,
      // Every stamp is the request instant: no client clock reads here.
      addRequest: (input) => dispatch({ type: "add", input, at: nowIso }),
      patchRequest: (id, patch) => dispatch({ type: "patch", id, patch, at: nowIso }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status, at: nowIso }),
      removeRequest: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", at: nowIso })
      },
    }),
    [state, now, nowIso, persisted, saved, saveFailed]
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
