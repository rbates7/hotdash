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

    case "set-status":
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.id && r.status !== action.status
            ? { ...r, status: action.status, updatedAt: action.at }
            : r
        ),
      }

    case "remove":
      return {
        ...state,
        requests: state.requests.filter((r) => r.id !== action.id),
      }

    case "hydrate":
      return action.state ?? state

    case "reset":
      return initialState(new Date(action.at))
  }
}

/** Reducer state plus whether localStorage has been consulted yet. */
type Shell = { data: State; hydrated: boolean }

function shellReducer(shell: Shell, action: Action): Shell {
  return {
    data: reducer(shell.data, action),
    hydrated: shell.hydrated || action.type === "hydrate",
  }
}

export function initialState(at: Date = now()): State {
  const requests = buildSeed(at)
  return { requests, nextId: requests.length + 1 }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage so a reload keeps
 * Dan's ideas and any edits. Bump the version whenever the seed or the shape
 * changes so stale saves are discarded instead of half-applied. There is no
 * server copy and no API behind this page.
 */
export const STORAGE_KEY = "hotdash.feature-requests.v1"

function isRequest(value: unknown): value is FeatureRequest {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.ask === "string" &&
    typeof v.from === "string" &&
    isFeatureStatus(v.status) &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string"
  )
}

function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.requests) &&
    v.requests.every(isRequest) &&
    typeof v.nextId === "number"
  )
}

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

/* ------------------------------------------------------------------ store */

type Store = State & {
  /** True once localStorage has been read and writes are flowing. */
  persisted: boolean
  addRequest: (input: NewRequestInput) => void
  patchRequest: (id: string, patch: RequestPatch) => void
  setStatus: (id: string, status: FeatureStatus) => void
  removeRequest: (id: string) => void
  resetDemoData: () => void
}

const FeatureRequestsContext = React.createContext<Store | null>(null)

export function FeatureRequestsProvider({ children }: { children: React.ReactNode }) {
  const [{ data: state, hydrated: persisted }, dispatch] = React.useReducer(
    shellReducer,
    undefined,
    () => ({ data: initialState(), hydrated: false })
  )

  // The server has no localStorage, so it renders with `persisted: false` and
  // the page shows skeletons rather than the seed. On the client the saved
  // copy is read in a *layout* effect — it runs before the browser paints, so
  // the first frame a user sees is already their data, never the seed.
  React.useLayoutEffect(() => {
    dispatch({ type: "hydrate", state: loadState(window.localStorage) })
  }, [])

  React.useEffect(() => {
    if (persisted) saveState(window.localStorage, state)
  }, [persisted, state])

  const value = React.useMemo<Store>(() => {
    const at = () => now().toISOString()
    return {
      ...state,
      persisted,
      addRequest: (input) => dispatch({ type: "add", input, at: at() }),
      patchRequest: (id, patch) => dispatch({ type: "patch", id, patch, at: at() }),
      setStatus: (id, status) => dispatch({ type: "set-status", id, status, at: at() }),
      removeRequest: (id) => dispatch({ type: "remove", id }),
      resetDemoData: () => dispatch({ type: "reset", at: at() }),
    }
  }, [state, persisted])

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
