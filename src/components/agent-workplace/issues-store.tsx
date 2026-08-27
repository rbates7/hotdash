"use client"

import * as React from "react"

import type { Issue, IssuePriority, IssueStatus, Sprint } from "@/lib/issues"
import {
  NOW,
  actors as seedActors,
  issues as seedIssues,
  sprints as seedSprints,
  RASHAD,
} from "@/lib/issues-fixture"

type State = {
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
}

type Action =
  | { type: "create-issue"; input: NewIssueInput; at: string }
  | { type: "patch-issue"; key: string; patch: Partial<Issue>; at: string }
  | { type: "add-comment"; key: string; body: string; at: string }
  | { type: "create-sprint"; name: string; startDate: string; endDate: string }
  | { type: "start-sprint"; id: string }
  | { type: "complete-sprint"; id: string }

function touch(issue: Issue, at: string): Issue {
  return { ...issue, updatedAt: at }
}

function reducer(state: State, action: Action): State {
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

function initialState(): State {
  const highest = seedIssues.reduce((max, i) => {
    const n = Number(i.key.split("-")[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return { issues: seedIssues, sprints: seedSprints, nextKey: highest + 1 }
}

type Store = State & {
  actors: typeof seedActors
  /** Fixed clock. A live one would hydrate mismatched against the server. */
  now: Date
  createIssue: (input: NewIssueInput) => void
  patchIssue: (key: string, patch: Partial<Issue>) => void
  addComment: (key: string, body: string) => void
  createSprint: (name: string, startDate: string, endDate: string) => void
  startSprint: (id: string) => void
  completeSprint: (id: string) => void
}

const IssuesContext = React.createContext<Store | null>(null)

export function IssuesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, undefined, initialState)

  const value = React.useMemo<Store>(() => {
    const at = () => new Date().toISOString()
    return {
      ...state,
      actors: seedActors,
      now: NOW,
      createIssue: (input) => dispatch({ type: "create-issue", input, at: at() }),
      patchIssue: (key, patch) =>
        dispatch({ type: "patch-issue", key, patch, at: at() }),
      addComment: (key, body) =>
        dispatch({ type: "add-comment", key, body, at: at() }),
      createSprint: (name, startDate, endDate) =>
        dispatch({ type: "create-sprint", name, startDate, endDate }),
      startSprint: (id) => dispatch({ type: "start-sprint", id }),
      completeSprint: (id) => dispatch({ type: "complete-sprint", id }),
    }
  }, [state])

  return (
    <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>
  )
}

export function useIssues() {
  const ctx = React.useContext(IssuesContext)
  if (!ctx) throw new Error("useIssues must be used within an IssuesProvider.")
  return ctx
}
