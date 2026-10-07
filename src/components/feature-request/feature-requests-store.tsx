"use client"

import * as React from "react"

import { now } from "@/lib/feature-requests/clock"
import {
  DEFAULT_FROM,
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
  | { type: "hydrate"; state: State | null }
  | { type: "reset"; at: string }

function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const title = action.input.title.trim()
      if (!title) return state
      const request: FeatureRequest = {
        id: `fr-${state.nextId}`,
        title,
        ask: action.input.ask?.trim() ?? "",
        from: clean(action.input.from, DEFAULT_FROM),
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

    case "patch":
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== action.id) return r
          const next: FeatureRequest = {
            ...r,
            title: clean(action.patch.title, r.title),
            ask: action.patch.ask === undefined ? r.ask : action.patch.ask.trim(),
            from: clean(action.patch.from, r.from),
            updatedAt: action.at,
          }
          // Rewriting the words makes the card the founder's; a sample tag
          // on text we did not write would be a lie.
          const rewritten = next.title !== r.title || next.ask !== r.ask
          if (rewritten && next.sample) delete next.sample
          return next
        }),
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
      return action.state ?? state

    case "reset":
      return initialState(new Date(action.at))
  }
}

/**
 * Reducer state plus two facts about localStorage: whether it has been
 * consulted yet (`hydrated`), and whether this browser holds a saved copy
 * (`saved`). The seed is never written on its own — only a real edit, or a
 * copy found on load, makes `saved` true. Reset clears both the copy and the
 * flag, so a fresh visit always gets a seed built against *that* day.
 */
type Shell = { data: State; hydrated: boolean; saved: boolean }

const EDITS: ReadonlySet<Action["type"]> = new Set(["add", "patch", "set-status", "remove"])

function shellReducer(shell: Shell, action: Action): Shell {
  const data = reducer(shell.data, action)
  switch (action.type) {
    case "hydrate":
      return { data, hydrated: true, saved: action.state !== null }
    case "reset":
      return { data, hydrated: shell.hydrated, saved: false }
    default:
      // Only a change that actually changed something counts as an edit.
      return {
        data,
        hydrated: shell.hydrated,
        saved: shell.saved || (EDITS.has(action.type) && data !== shell.data),
      }
  }
}

export function initialState(at: Date = now()): State {
  const requests = buildSeed(at)
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

const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v))

/** One saved card, checked field by field. Anything off and the whole copy is refused. */
export function isRequest(value: unknown): value is FeatureRequest {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.title === "string" &&
    v.title.trim().length > 0 &&
    typeof v.ask === "string" &&
    typeof v.from === "string" &&
    v.from.trim().length > 0 &&
    isFeatureStatus(v.status) &&
    isIso(v.createdAt) &&
    isIso(v.updatedAt) &&
    (v.sample === undefined || v.sample === true)
  )
}

export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.requests) || !v.requests.every(isRequest)) return false
  if (!Number.isInteger(v.nextId) || (v.nextId as number) < 1) return false
  const ids = new Set(v.requests.map((r) => r.id))
  return ids.size === v.requests.length
}

/**
 * The saved copy, or `null` when there is none or any part of it is bad —
 * the caller then falls back to the seed rather than half-applying it.
 */
export function loadState(storage: Storage | undefined): State | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveState(storage: Storage | undefined, state: State) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota or private mode: edits still work for the session.
  }
}

export function clearState(storage: Storage | undefined) {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Same as above: nothing to do.
  }
}

/* ------------------------------------------------------------------ store */

type Store = State & {
  /** True once localStorage has been read; the board can show real cards. */
  persisted: boolean
  /** True when this browser holds a saved copy (an edit was made, or one was found on load). */
  saved: boolean
  addRequest: (input: NewRequestInput) => void
  patchRequest: (id: string, patch: RequestPatch) => void
  setStatus: (id: string, status: FeatureStatus) => void
  removeRequest: (id: string) => void
  resetDemoData: () => void
}

const FeatureRequestsContext = React.createContext<Store | null>(null)

export function FeatureRequestsProvider({ children }: { children: React.ReactNode }) {
  const [{ data: state, hydrated: persisted, saved }, dispatch] = React.useReducer(
    shellReducer,
    undefined,
    () => ({ data: initialState(), hydrated: false, saved: false })
  )

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", state: loadState(window.localStorage) })
  }, [])

  // Write only once there is something of the founder's to keep. A first
  // visit with no edits leaves localStorage untouched, so the seed is not
  // frozen to the day it was first seen.
  React.useEffect(() => {
    if (persisted && saved) saveState(window.localStorage, state)
  }, [persisted, saved, state])

  const value = React.useMemo<Store>(() => {
    const at = () => now().toISOString()
    return {
      ...state,
      persisted,
      saved,
      addRequest: (input) => dispatch({ type: "add", input, at: at() }),
      patchRequest: (id, patch) => dispatch({ type: "patch", id, patch, at: at() }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status, at: at() }),
      removeRequest: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", at: at() })
      },
    }
  }, [state, persisted, saved])

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
