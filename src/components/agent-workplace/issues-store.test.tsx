import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { activeSprint, daysUntil } from "@/lib/issues"
import { buildIssues } from "@/lib/issues-fixture"
import {
  IssuesProvider,
  STORAGE_KEY,
  initialState,
  isState,
  issuesStorage,
  loadState,
  loadStateOrSeed,
  reducer,
  saveState,
  useIssues,
} from "@/components/agent-workplace/issues-store"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const AT = "2026-08-27T15:00:00.000Z"

describe("reducer", () => {
  it("edits priority and project on an issue", () => {
    let state = initialState(FIXED_NOW)
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
    let state = initialState(FIXED_NOW)
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
    const state = reducer(initialState(FIXED_NOW), {
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
    const state = reducer(initialState(FIXED_NOW), { type: "start-sprint", id: "sprint-5" })
    expect(state.sprints.filter((s) => s.status === "active")).toHaveLength(1)
    expect(state.sprints.find((s) => s.id === "sprint-5")!.status).toBe("planned")
  })

  it("reset restores the seed", () => {
    let state = reducer(initialState(FIXED_NOW), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low" },
      at: AT,
    })
    state = reducer(state, { type: "reset", at: FIXED_NOW.toISOString() })
    expect(state.issues).toEqual(buildIssues(FIXED_NOW))
  })

  it("reset re-dates a stale save relative to the moment of the reset", () => {
    // A board saved six weeks ago: its sprint has long since run out.
    const sixWeeksAgo = new Date(FIXED_NOW.getTime() - 42 * 86_400_000)
    const stale = initialState(sixWeeksAgo)
    expect(daysUntil(activeSprint(stale.sprints)!.endDate, FIXED_NOW)).toBe(9 - 42)

    const fresh = reducer(stale, { type: "reset", at: FIXED_NOW.toISOString() })
    const sprint = activeSprint(fresh.sprints)!
    expect(daysUntil(sprint.endDate, FIXED_NOW)).toBe(9)
    expect(fresh).toEqual(initialState(FIXED_NOW))
  })
})

describe("initialState is relative to the given instant", () => {
  it("dates the active sprint five days back and nine days out", () => {
    for (const at of [FIXED_NOW, new Date("2027-01-15T03:00:00Z")]) {
      const sprint = activeSprint(initialState(at).sprints)!
      expect(daysUntil(sprint.endDate, at)).toBe(9)
      expect(Date.parse(sprint.startDate)).toBe(at.getTime() - 5 * 86_400_000)
      expect(Date.parse(sprint.endDate)).toBe(at.getTime() + 9 * 86_400_000)
    }
  })

  it("keeps every issue timestamp at or before the instant", () => {
    const state = initialState(FIXED_NOW)
    for (const issue of state.issues) {
      expect(Date.parse(issue.createdAt)).toBeLessThanOrEqual(FIXED_NOW.getTime())
      expect(Date.parse(issue.updatedAt)).toBeLessThanOrEqual(FIXED_NOW.getTime())
    }
  })
})

describe("localStorage round trip", () => {
  it("saves and loads the same state", () => {
    const state = reducer(initialState(FIXED_NOW), {
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
  const { issues, sprints, now, persisted, edited, saved, saveFailed, patchIssue, resetDemoData } = useIssues()
  const issue = issues.find((i) => i.key === "CHLK-404")!
  const sprint = activeSprint(sprints)
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="priority">{issue.priority}</span>
      <span data-testid="project">{issue.project ?? "none"}</span>
      <span data-testid="now">{now.toISOString()}</span>
      <span data-testid="days-left">{sprint ? daysUntil(sprint.endDate, now) : "none"}</span>
      <button
        type="button"
        onClick={() => patchIssue("CHLK-404", { priority: "low", project: "Billing" })}
      >
        edit
      </button>
      <button type="button" onClick={resetDemoData}>
        reset
      </button>
    </div>
  )
}

const mount = (nowMs = FIXED_NOW_MS) =>
  render(
    <IssuesProvider nowMs={nowMs}>
      <Probe />
    </IssuesProvider>
  )
const hydrated = () => screen.findByText("true", { selector: "[data-testid=persisted]" })
const DAY = 86_400_000

describe("IssuesProvider persistence", () => {
  it("persists edits and rehydrates them after a remount (reload)", async () => {
    const first = render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
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
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <Probe />
      </IssuesProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")
  })

  it("falls back to the seed when nothing is saved", async () => {
    render(
      <IssuesProvider nowMs={FIXED_NOW_MS}>
        <Probe />
      </IssuesProvider>
    )
    expect(await screen.findByText("true", { selector: "[data-testid=persisted]" })).toBeInTheDocument()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
    expect(screen.getByTestId("project")).toHaveTextContent("none")
  })
})

describe("IssuesProvider persistence policy (M1)", () => {
  it("writes nothing until the first real edit, so a viewer always gets a fresh seed", async () => {
    mount()
    await hydrated()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("ignores an old v1 save (frozen demo dates) entirely", async () => {
    const v1 = JSON.stringify({
      issues: [],
      sprints: [
        {
          id: "sprint-4",
          name: "Sprint 4",
          startDate: "2026-08-22T14:00:00.000Z",
          endDate: "2026-09-05T14:00:00.000Z",
          status: "active",
        },
      ],
      nextKey: 419,
    })
    window.localStorage.setItem("hotdash.agent-workplace.v1", v1)
    mount(new Date("2026-10-07T05:00:00Z").getTime())
    await hydrated()
    // Fresh seed, nine days out from today — not "31 days over".
    expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
    // And the stale v1 copy was neither read nor promoted.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("a 10-day-old v2 save with edits loads, measured against today, and Reset re-dates it", async () => {
    const tenDaysAgo = new Date(FIXED_NOW_MS - 10 * DAY)
    const edited = reducer(initialState(tenDaysAgo), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low" },
      at: tenDaysAgo.toISOString(),
    })
    saveState(window.localStorage, edited)

    mount()
    await hydrated()
    // The edit is back and the sprint saved ten days ago honestly reads one day over.
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
    expect(screen.getByTestId("days-left")).toHaveTextContent("-1")

    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
    expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("Reset clears the saved copy so the next load is a fresh seed again", async () => {
    const first = mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

    first.unmount()
    mount()
    await hydrated()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
  })
})

describe("now lives in store state (L1)", () => {
  it("is the page's instant on load and moves to the moment of a Reset", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T05:00:00Z"), shouldAdvanceTime: true })
    try {
      mount()
      await hydrated()
      expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
      act(() => screen.getByRole("button", { name: "reset" }).click())
      expect(screen.getByTestId("now")).toHaveTextContent("2026-10-07T05:00:00")
      expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    } finally {
      vi.useRealTimers()
    }
  })

  it("a saved copy never brings its own clock", () => {
    const saved = initialState(new Date(FIXED_NOW_MS - 3 * DAY))
    const state = reducer(initialState(FIXED_NOW), { type: "hydrate", state: saved })
    expect(state.now).toBe(FIXED_NOW.toISOString())
    expect(state.sprints).toEqual(saved.sprints)
  })
})

describe("saved items are validated one by one (L2)", () => {
  const good = () => initialState(FIXED_NOW)

  it("accepts a well-formed copy", () => {
    expect(isState(good())).toBe(true)
  })

  it("rejects the whole copy when one issue is malformed", () => {
    for (const bad of [
      { status: "shipped" },
      { priority: "p0" },
      { key: 404 },
      { labels: "billing" },
      { createdAt: "yesterday" },
      { assigneeId: 7 },
      { isAgentWorking: "yes" },
      { comments: undefined },
    ]) {
      const state = good()
      state.issues[3] = { ...state.issues[3], ...bad } as never
      expect(isState(state), JSON.stringify(bad)).toBe(false)
    }
  })

  it("rejects a malformed sprint or clock", () => {
    const s1 = good()
    s1.sprints[0] = { ...s1.sprints[0], status: "paused" } as never
    expect(isState(s1)).toBe(false)
    const s2 = good()
    s2.sprints[0] = { ...s2.sprints[0], endDate: "soon" }
    expect(isState(s2)).toBe(false)
    expect(isState({ ...good(), now: "later" })).toBe(false)
  })

  it("falls back to the seed when a saved issue is bad", async () => {
    const state = good()
    state.issues[3] = { ...state.issues[3], priority: "p0" } as never
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    expect(loadState(window.localStorage)).toBeNull()
    mount()
    await hydrated()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
  })
})


describe("shared persistence policy (Workplace)", () => {
  it("exposes edited / saved / saveFailed: nothing saved until the first edit", async () => {
    mount()
    await hydrated()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
  })

  it("reports a failed save and never claims Saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaExceededStorage().setItem)
    try {
      mount()
      await hydrated()
      act(() => screen.getByRole("button", { name: "edit" }).click())
      expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=false failed=true")
      expect(screen.getByTestId("priority")).toHaveTextContent("low") // the edit still works this session
    } finally {
      spy.mockRestore()
    }
  })

  it("parks a copy that fails validation under <key>.rejected and loads the seed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ issues: "nope" })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(issuesStorage.rejectedKey)).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW)).toEqual(initialState(FIXED_NOW))
  })

  it("re-hydrates when another tab writes the key, keeping this page's clock", async () => {
    mount()
    await hydrated()
    const theirs = reducer(initialState(new Date(FIXED_NOW_MS - DAY)), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low" },
      at: AT,
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
    expect(screen.getByTestId("status")).toHaveTextContent("saved=true")
  })
})
