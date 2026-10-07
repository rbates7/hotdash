"use client"

import * as React from "react"

import type { Issue, IssuePriority, IssueStatus, Sprint } from "@/lib/issues"
import { PRIORITY_ORDER, STATUS_ORDER } from "@/lib/issues"
import {
  actors as seedActors,
  buildIssues,
  buildSprints,
  RASHAD,
} from "@/lib/issues-fixture"

export type State = {
  issues: Issue[]
  sprints: Sprint[]
  /** Next number for a generated CHLK-n key. */
  nextKey: number
  /**
   * The instant every relative figure is measured from, as ISO. Set from
   * the server's request time on load; moved to the moment of a Reset so
   * the regenerated seed is fresh. Never taken from a saved copy.
   */
  now: string
}

export type NewIssueInput = {
  title: string
  description?: string
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  sprintId: string | null
  labels: string[]
  project?: string
}

export type Action =
  | { type: "create-issue"; input: NewIssueInput; at: string }
  | { type: "patch-issue"; key: string; patch: Partial<Issue>; at: string }
  | { type: "add-comment"; key: string; body: string; at: string }
  | { type: "create-sprint"; name: string; startDate: string; endDate: string }
  | { type: "start-sprint"; id: string }
  | { type: "complete-sprint"; id: string }
  | { type: "hydrate"; state: State | null }
  /** Regenerates the seed relative to `at`, so its dates are fresh again. */
  | { type: "reset"; at: string }

function touch(issue: Issue, at: string): Issue {
  return { ...issue, updatedAt: at }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "create-issue": {
      const key = `CHLK-${state.nextKey}`
      const issue: Issue = {
        key,
        title: action.input.title,
        description: action.input.description,
        status: action.input.status,
        priority: action.input.priority,
        assigneeId: action.input.assigneeId,
        sprintId: action.input.sprintId,
        labels: action.input.labels,
        project: action.input.project,
        createdById: RASHAD,
        createdAt: action.at,
        updatedAt: action.at,
        isAgentWorking: false,
        activity: [
          {
            id: `${key}-a1`,
            actorId: RASHAD,
            verb: "created this issue",
            at: action.at,
          },
        ],
        comments: [],
      }
      return {
        ...state,
        issues: [issue, ...state.issues],
        nextKey: state.nextKey + 1,
      }
    }

    case "patch-issue":
      return {
        ...state,
        issues: state.issues.map((i) =>
          i.key === action.key ? touch({ ...i, ...action.patch }, action.at) : i
        ),
      }

    case "add-comment":
      return {
        ...state,
        issues: state.issues.map((i) =>
          i.key === action.key
            ? touch(
                {
                  ...i,
                  comments: [
                    ...i.comments,
                    {
                      id: `${i.key}-c${i.comments.length + 1}`,
                      actorId: RASHAD,
                      body: action.body,
                      at: action.at,
                    },
                  ],
                },
                action.at
              )
            : i
        ),
      }

    case "create-sprint": {
      const id = `sprint-${state.sprints.length + 1}-${action.name
        .toLowerCase()
        .replace(/\s+/g, "-")}`
      return {
        ...state,
        sprints: [
          ...state.sprints,
          {
            id,
            name: action.name,
            startDate: action.startDate,
            endDate: action.endDate,
            status: "planned",
          },
        ],
      }
    }

    case "start-sprint":
      // At most one sprint may be active. Refuse rather than silently
      // demoting a running sprint — the Backlog UI disables the control too,
      // but the invariant belongs here where it cannot be bypassed.
      if (state.sprints.some((s) => s.status === "active")) return state
      return {
        ...state,
        sprints: state.sprints.map((s) =>
          s.id === action.id ? { ...s, status: "active" } : s
        ),
      }

    case "complete-sprint":
      return {
        ...state,
        sprints: state.sprints.map((s) =>
          s.id === action.id ? { ...s, status: "completed" } : s
        ),
        // Unfinished work returns to the backlog rather than vanishing with
        // the sprint; finished work stays attached for the record.
        issues: state.issues.map((i) =>
          i.sprintId === action.id && i.status !== "done"
            ? { ...i, sprintId: null }
            : i
        ),
      }

    case "hydrate":
      // A saved copy brings its board, never its clock: this page's instant
      // stays so the saved sprint is measured against today.
      return action.state ? { ...action.state, now: state.now } : state

    case "reset":
      return initialState(new Date(action.at))
  }
}

/** Actions that are the founder's own edits, as opposed to plumbing. */
const USER_EDITS = new Set<Action["type"]>([
  "create-issue",
  "patch-issue",
  "add-comment",
  "create-sprint",
  "start-sprint",
  "complete-sprint",
])

/**
 * Reducer state plus persistence bookkeeping: whether localStorage has been
 * consulted yet, and whether this browser holds edits worth saving.
 */
type Shell = { data: State; hydrated: boolean; dirty: boolean }

function shellReducer(shell: Shell, action: Action): Shell {
  return {
    data: reducer(shell.data, action),
    hydrated: shell.hydrated || action.type === "hydrate",
    dirty:
      action.type === "reset"
        ? false
        : action.type === "hydrate"
          ? action.state !== null
          : shell.dirty || USER_EDITS.has(action.type),
  }
}

/**
 * The demo seed, dated relative to `now`: the active sprint started five
 * days before it and ends nine days after, comments and activity are hours
 * before it, and so on. Build it from the instant the page was requested.
 */
export function initialState(now: Date): State {
  const issues = buildIssues(now)
  const highest = issues.reduce((max, i) => {
    const n = Number(i.key.split("-")[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return {
    issues,
    sprints: buildSprints(now),
    nextKey: highest + 1,
    now: now.toISOString(),
  }
}

/* ------------------------------------------------------------ persistence */

/**
 * Board state is saved to this browser's localStorage so a reload keeps
 * edits. This is a stand-in until a real datastore exists (CHLK-414); there
 * is no server copy.
 *
 * Policy — persist only after the first real edit:
 * - A browser that has never edited the board is never written to, so it
 *   gets a fresh seed, dated from today, on every load. The seed cannot go
 *   stale in a browser that only looked at it.
 * - Once the founder edits something, the whole board is saved and a reload
 *   restores it. Dates in that copy are whatever they were when edited, so
 *   a sprint saved on day 0 honestly reads "N days over" after it ends.
 * - Reset discards the saved copy and regenerates the seed from the moment
 *   of the reset, returning the browser to the never-edited state.
 *
 * Bump the version whenever the seed or the shape changes so saves from an
 * older build are discarded instead of half-applied. v1 (frozen demo dates)
 * is ignored entirely.
 */
export const STORAGE_KEY = "hotdash.agent-workplace.v2"

const isString = (v: unknown): v is string => typeof v === "string"
const isStringOrNull = (v: unknown): v is string | null => v === null || isString(v)
const isIsoDate = (v: unknown): v is string => isString(v) && !Number.isNaN(Date.parse(v))

function isIssue(value: unknown): value is Issue {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    isString(v.key) &&
    isString(v.title) &&
    (STATUS_ORDER as string[]).includes(v.status as string) &&
    (PRIORITY_ORDER as string[]).includes(v.priority as string) &&
    isStringOrNull(v.assigneeId) &&
    isStringOrNull(v.sprintId) &&
    Array.isArray(v.labels) &&
    v.labels.every(isString) &&
    isString(v.createdById) &&
    isIsoDate(v.createdAt) &&
    isIsoDate(v.updatedAt) &&
    typeof v.isAgentWorking === "boolean" &&
    Array.isArray(v.activity) &&
    Array.isArray(v.comments)
  )
}

function isSprint(value: unknown): value is Sprint {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    isString(v.name) &&
    isIsoDate(v.startDate) &&
    isIsoDate(v.endDate) &&
    (v.status === "planned" || v.status === "active" || v.status === "completed")
  )
}

/**
 * Every issue and sprint is checked, not just the envelope: one malformed
 * item means the whole copy is dropped in favour of the seed, rather than
 * rendering half a board.
 */
export function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.issues) &&
    v.issues.every(isIssue) &&
    Array.isArray(v.sprints) &&
    v.sprints.every(isSprint) &&
    typeof v.nextKey === "number" &&
    isIsoDate(v.now)
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

export function clearState(storage: Storage | undefined) {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the next load falls back to the seed anyway.
  }
}

type Store = Omit<State, "now"> & {
  actors: typeof seedActors
  /**
   * `State.now` as a Date: the server's request instant, or the moment of
   * the last Reset. Every relative figure is measured from it; a live
   * client clock would hydrate mismatched against the server's HTML.
   */
  now: Date
  /** True once localStorage has been read; edits made after this are saved. */
  persisted: boolean
  createIssue: (input: NewIssueInput) => void
  patchIssue: (key: string, patch: Partial<Issue>) => void
  addComment: (key: string, body: string) => void
  createSprint: (name: string, startDate: string, endDate: string) => void
  startSprint: (id: string) => void
  completeSprint: (id: string) => void
  resetDemoData: () => void
}

const IssuesContext = React.createContext<Store | null>(null)

export function IssuesProvider({
  nowMs,
  children,
}: {
  /** `now().getTime()` from the server component rendering this page. */
  nowMs: number
  children: React.ReactNode
}) {
  const [{ data: state, hydrated: persisted, dirty }, dispatch] = React.useReducer(
    shellReducer,
    undefined,
    () => ({ data: initialState(new Date(nowMs)), hydrated: false, dirty: false })
  )

  // Server and first client paint both use the seed; the saved copy is
  // applied after mount so the HTML never mismatches.
  React.useEffect(() => {
    dispatch({ type: "hydrate", state: loadState(window.localStorage) })
  }, [])

  // Write only once there is something of the founder's to keep (see the
  // persistence policy above); a Reset clears the copy instead.
  React.useEffect(() => {
    if (!persisted) return
    if (dirty) saveState(window.localStorage, state)
    else clearState(window.localStorage)
  }, [persisted, dirty, state])

  const now = React.useMemo(() => new Date(state.now), [state.now])

  const value = React.useMemo<Store>(() => {
    const at = () => new Date().toISOString()
    return {
      ...state,
      actors: seedActors,
      now,
      persisted,
      createIssue: (input) => dispatch({ type: "create-issue", input, at: at() }),
      patchIssue: (key, patch) =>
        dispatch({ type: "patch-issue", key, patch, at: at() }),
      addComment: (key, body) =>
        dispatch({ type: "add-comment", key, body, at: at() }),
      createSprint: (name, startDate, endDate) =>
        dispatch({ type: "create-sprint", name, startDate, endDate }),
      startSprint: (id) => dispatch({ type: "start-sprint", id }),
      completeSprint: (id) => dispatch({ type: "complete-sprint", id }),
      // Reset re-dates the seed from right now, not from the page load, so a
      // save left over from an older session comes back fresh.
      resetDemoData: () => dispatch({ type: "reset", at: at() }),
    }
  }, [state, persisted, now])

  return (
    <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>
  )
}

export function useIssues() {
  const ctx = React.useContext(IssuesContext)
  if (!ctx) throw new Error("useIssues must be used within an IssuesProvider.")
  return ctx
}
