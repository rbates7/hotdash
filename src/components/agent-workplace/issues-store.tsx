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
import {
  createStorage,
  isBoolean,
  isIsoInstant,
  isOptionalString,
  isString,
  isStringOrNull,
  parseAll,
  initialShell,
  persistenceShellReducer,
  reseedNowMs,
  usePersistenceSync,
  type LoadResult,
  type PersistenceShell,
  type PersistenceStore,
} from "@/lib/persistence"
import type { ActivityEntry, Comment } from "@/lib/issues"
import { now as clockNow } from "@/lib/clock"

export type State = {
  issues: Issue[]
  sprints: Sprint[]
  /** Next number for a generated CHLK-n key. */
  nextKey: number
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
  /** `nowMs` is the request's instant on mount, `now()` for a cross-tab event. */
  | { type: "hydrate"; result: LoadResult<SavedState>; nowMs: number }
  | { type: "save-result"; ok: boolean }
  /** Regenerates the seed from `nowMs` (`now()` at the click), so its dates are fresh again. */
  | { type: "reset"; nowMs: number }

/** The founder's own edits, as opposed to persistence plumbing. */
export type EditAction = Exclude<Action, { type: "hydrate" | "save-result" | "reset" }>

function touch(issue: Issue, at: string): Issue {
  return { ...issue, updatedAt: at }
}

/** The board's own transitions. Returns its input for a no-op. */
export function reducer(state: State, action: EditAction): State {
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

  }
}

/**
 * The shared persistence shell around the board. A saved copy brings its
 * board, never its clock: this page's instant stays so the saved sprint is
 * measured against today. No copy — nothing saved, or another tab's Reset —
 * means a fresh seed here too. Everything else is the shared reducer's
 * business (no-op edits return the same shell, hydrates never write,
 * `saved` follows the write's result).
 */
type Shell = PersistenceShell<State>

export function shellReducer(shell: Shell, action: Action): Shell {
  switch (action.type) {
    case "hydrate":
      return persistenceShellReducer<State, SavedState>(shell, {
        type: "hydrate",
        result: action.result,
        nowMs: action.nowMs,
        // No copy (nothing saved, or another tab's Reset): a fresh seed dated
        // from this moment, and the clock moves with it.
        fallback: (nowMs) => initialState(new Date(nowMs)),
        // A copy brings its board, never its clock: the shell's instant stays.
        adopt: (saved) => ({ data: saved }),
      })
    case "save-result":
      return persistenceShellReducer(shell, action)
    case "reset":
      return persistenceShellReducer(shell, {
        type: "reset",
        nowMs: action.nowMs,
        seed: (nowMs) => initialState(new Date(nowMs)),
      })
    default:
      return persistenceShellReducer(shell, { type: "edit", data: reducer(shell.data, action) })
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

/** What is written. The clock lives in the shell, so none is ever saved. */
export type SavedState = State

const isStatus = (v: unknown): v is IssueStatus => (STATUS_ORDER as readonly string[]).includes(v as string)
const isPriority = (v: unknown): v is IssuePriority =>
  (PRIORITY_ORDER as readonly string[]).includes(v as string)
const isSprintStatus = (v: unknown): v is Sprint["status"] =>
  v === "planned" || v === "active" || v === "completed"

/** Known keys only; anything else a saved copy carries is dropped. */
function parseActivity(value: unknown): ActivityEntry | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (!isString(v.id) || !isString(v.actorId) || !isString(v.verb) || !isIsoInstant(v.at)) return null
  return { id: v.id, actorId: v.actorId, verb: v.verb, at: v.at }
}

function parseComment(value: unknown): Comment | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (!isString(v.id) || !isString(v.actorId) || !isString(v.body) || !isIsoInstant(v.at)) return null
  return { id: v.id, actorId: v.actorId, body: v.body, at: v.at }
}

export function parseIssue(value: unknown): Issue | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (
    !isString(v.key) ||
    !isString(v.title) ||
    !isOptionalString(v.description) ||
    !isStatus(v.status) ||
    !isPriority(v.priority) ||
    !isStringOrNull(v.assigneeId) ||
    !isStringOrNull(v.sprintId) ||
    !Array.isArray(v.labels) ||
    !v.labels.every(isString) ||
    !isOptionalString(v.project) ||
    !isString(v.createdById) ||
    !isIsoInstant(v.createdAt) ||
    !isIsoInstant(v.updatedAt) ||
    !isBoolean(v.isAgentWorking) ||
    !isOptionalString(v.blockerReason)
  ) {
    return null
  }
  const activity = parseAll(v.activity, parseActivity)
  const comments = parseAll(v.comments, parseComment)
  if (!activity || !comments) return null
  const issue: Issue = {
    key: v.key,
    title: v.title,
    status: v.status,
    priority: v.priority,
    assigneeId: v.assigneeId,
    sprintId: v.sprintId,
    labels: v.labels,
    createdById: v.createdById,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    isAgentWorking: v.isAgentWorking,
    activity,
    comments,
  }
  if (v.description !== undefined) issue.description = v.description
  if (v.project !== undefined) issue.project = v.project
  if (v.blockerReason !== undefined) issue.blockerReason = v.blockerReason
  return issue
}

export function parseSprint(value: unknown): Sprint | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (
    !isString(v.id) ||
    !isString(v.name) ||
    !isOptionalString(v.goal) ||
    !isIsoInstant(v.startDate) ||
    !isIsoInstant(v.endDate) ||
    !isSprintStatus(v.status)
  ) {
    return null
  }
  const sprint: Sprint = {
    id: v.id,
    name: v.name,
    startDate: v.startDate,
    endDate: v.endDate,
    status: v.status,
  }
  if (v.goal !== undefined) sprint.goal = v.goal
  return sprint
}

/**
 * Every issue, sprint, activity entry and comment is checked field by
 * field and rebuilt from known keys only, so a bad saved comment cannot
 * reach the ticket view. One malformed item drops the whole copy for the
 * seed rather than rendering half a board. The page's clock (`now`) is
 * never read from a copy; it is not saved either.
 */
export function parseState(value: unknown): SavedState | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const issues = parseAll(v.issues, parseIssue)
  const sprints = parseAll(v.sprints, parseSprint)
  if (!issues || !sprints) return null
  if (typeof v.nextKey !== "number" || !Number.isInteger(v.nextKey)) return null
  const highest = issues.reduce((max, i) => {
    const n = Number(i.key.split("-")[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  if (v.nextKey <= highest) return null
  if (new Set(issues.map((i) => i.key)).size !== issues.length) return null
  if (new Set(sprints.map((s) => s.id)).size !== sprints.length) return null
  if (sprints.filter((s) => s.status === "active").length > 1) return null
  return { issues, sprints, nextKey: v.nextKey }
}

/** Boolean form of `parseState`, for callers that only need yes/no. */
export function isState(value: unknown): boolean {
  return parseState(value) !== null
}

export const issuesStorage = createStorage<State>({
  key: STORAGE_KEY,
  legacyKeys: ["hotdash.agent-workplace.v1"],
  parse: parseState,
  // No clock is written: it lives in the shell, so two tabs' copies stay
  // byte-identical and neither re-writes the other's.
  serialize: ({ issues, sprints, nextKey }) => ({ issues, sprints, nextKey }),
})

/** Read the saved copy; `null` when there is none or it was rejected. */
export function loadState(storage: Storage | undefined): SavedState | null {
  return issuesStorage.load(storage).state
}

/** The saved copy, or a fresh seed dated from `now` when there is none. */
export function loadStateOrSeed(storage: Storage | undefined, now: Date): State {
  return loadState(storage) ?? initialState(now)
}

export function saveState(storage: Storage | undefined, state: State): boolean {
  return issuesStorage.save(storage, state)
}

export function clearState(storage: Storage | undefined) {
  issuesStorage.clear(storage)
}

type Store = State &
  PersistenceStore & {
  actors: typeof seedActors
  /**
   * The shell's clock as a Date: the server's request instant, or the
   * moment of the last Reset (or of a re-seed after another tab's). Every
   * relative figure is measured from it; a live client clock would hydrate
   * mismatched against the server's HTML. There is no second clock.
   */
  now: Date
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
  const [shell, dispatch] = React.useReducer(shellReducer, nowMs, (ms) =>
    initialShell(initialState(new Date(ms)), ms)
  )
  const { data: state, persisted, edited, saved, saveFailed } = shell

  // Server and first client paint both use the seed; the saved copy is
  // applied after mount so the HTML never mismatches. This first hydrate is
  // the only one dated from the request.
  React.useEffect(() => {
    dispatch({ type: "hydrate", result: issuesStorage.load(window.localStorage), nowMs })
  }, [nowMs])

  // Other tabs and writes, the shared way: a hydrate never writes; only a
  // moving edit count does (see the persistence policy above). The result
  // feeds the note: "Saved" only when the write succeeded. The hook reads
  // `now()` for a cross-tab re-seed.
  const onHydrate = React.useCallback(
    (result: LoadResult<SavedState>, at: number) => dispatch({ type: "hydrate", result, nowMs: at }),
    []
  )
  const onSaved = React.useCallback((ok: boolean) => dispatch({ type: "save-result", ok }), [])
  usePersistenceSync({ storage: issuesStorage, shell, onHydrate, onSaved })

  const now = React.useMemo(() => new Date(shell.nowMs), [shell.nowMs])

  const value = React.useMemo<Store>(() => {
    // Edit timestamps come from the one clock too, never a bare `new Date()`.
    const at = () => clockNow().toISOString()
    return {
      ...state,
      actors: seedActors,
      now,
      persisted,
      edited,
      saved,
      saveFailed,
      createIssue: (input) => dispatch({ type: "create-issue", input, at: at() }),
      patchIssue: (key, patch) =>
        dispatch({ type: "patch-issue", key, patch, at: at() }),
      addComment: (key, body) =>
        dispatch({ type: "add-comment", key, body, at: at() }),
      createSprint: (name, startDate, endDate) =>
        dispatch({ type: "create-sprint", name, startDate, endDate }),
      startSprint: (id) => dispatch({ type: "start-sprint", id }),
      completeSprint: (id) => dispatch({ type: "complete-sprint", id }),
      // Reset clears the copy and re-dates the seed from right now, not from
      // the page load, so a save left over from an older session comes back
      // fresh and the browser returns to the never-edited state.
      resetDemoData: () => {
        clearState(window.localStorage)
        dispatch({ type: "reset", nowMs: reseedNowMs() })
      },
    }
  }, [state, persisted, edited, saved, saveFailed, now])

  return (
    <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>
  )
}

export function useIssues() {
  const ctx = React.useContext(IssuesContext)
  if (!ctx) throw new Error("useIssues must be used within an IssuesProvider.")
  return ctx
}
