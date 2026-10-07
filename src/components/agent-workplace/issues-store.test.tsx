import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { issues as seedIssues } from "@/lib/issues-fixture"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  loadState,
  reducer,
  saveState,
  useIssues,
} from "@/components/agent-workplace/issues-store"

const AT = "2026-08-27T15:00:00.000Z"

describe("reducer", () => {
  it("edits priority and project on an issue", () => {
    let state = initialState()
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low", project: "Billing" },
      at: AT,
    })
    const issue = state.issues.find((i) => i.key === "CHLK-404")!
    expect(issue.priority).toBe("low")
    expect(issue.project).toBe("Billing")
    expect(issue.updatedAt).toBe(AT)
  })

  it("clears a project back to none", () => {
    let state = initialState()
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { project: "Sharing" },
      at: AT,
    })
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { project: undefined },
      at: AT,
    })
    expect(state.issues.find((i) => i.key === "CHLK-404")!.project).toBeUndefined()
  })

  it("keys a created issue after the highest seed and keeps its project", () => {
    const state = reducer(initialState(), {
      type: "create-issue",
      at: AT,
      input: {
        title: "Test",
        status: "todo",
        priority: "high",
        assigneeId: null,
        sprintId: "sprint-4",
        labels: [],
        project: "Imports",
      },
    })
    expect(state.issues[0].key).toBe("CHLK-419")
    expect(state.issues[0].project).toBe("Imports")
  })

  it("refuses to start a second active sprint", () => {
    const state = reducer(initialState(), { type: "start-sprint", id: "sprint-5" })
    expect(state.sprints.filter((s) => s.status === "active")).toHaveLength(1)
    expect(state.sprints.find((s) => s.id === "sprint-5")!.status).toBe("planned")
  })

  it("reset restores the seed", () => {
    let state = reducer(initialState(), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low" },
      at: AT,
    })
    state = reducer(state, { type: "reset" })
    expect(state.issues).toEqual(seedIssues)
  })
})

describe("localStorage round trip", () => {
  it("saves and loads the same state", () => {
    const state = reducer(initialState(), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "urgent" },
      at: AT,
    })
    saveState(window.localStorage, state)
    expect(loadState(window.localStorage)).toEqual(state)
  })

  it("ignores garbage and wrong shapes", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ issues: [] }))
    expect(loadState(window.localStorage)).toBeNull()
  })
})

function Probe() {
  const { issues, persisted, patchIssue } = useIssues()
  const issue = issues.find((i) => i.key === "CHLK-404")!
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="priority">{issue.priority}</span>
      <span data-testid="project">{issue.project ?? "none"}</span>
      <button
        type="button"
        onClick={() => patchIssue("CHLK-404", { priority: "low", project: "Billing" })}
      >
        edit
      </button>
    </div>
  )
}

describe("IssuesProvider persistence", () => {
  it("persists edits and rehydrates them after a remount (reload)", async () => {
    const first = render(
      <IssuesProvider>
        <Probe />
      </IssuesProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")

    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"priority":"low"')

    // Simulate a reload: tear the tree down and mount a fresh provider.
    first.unmount()
    render(
      <IssuesProvider>
        <Probe />
      </IssuesProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")
  })

  it("falls back to the seed when nothing is saved", async () => {
    render(
      <IssuesProvider>
        <Probe />
      </IssuesProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
    expect(screen.getByTestId("project")).toHaveTextContent("none")
  })
})
