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
  parseIssue,
  parseState,
  reducer,
  saveState,
  shellReducer,
  useIssues,
} from "@/components/agent-workplace/issues-store"
import { initialShell } from "@/lib/persistence"

/** Drive the shell (hydrate/reset live there, not in the board reducer) and return its data. */
const viaShell = (state: ReturnType<typeof initialState>, action: Parameters<typeof shellReducer>[1], nowMs = FIXED_NOW_MS) =>
  shellReducer({ ...initialShell(state, nowMs), persisted: true }, action).data
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
    state = viaShell(state, { type: "reset", nowMs: FIXED_NOW_MS })
    expect(state.issues).toEqual(buildIssues(FIXED_NOW))
  })

  it("reset re-dates a stale save relative to the moment of the reset", () => {
    // A board saved six weeks ago: its sprint has long since run out.
    const sixWeeksAgo = new Date(FIXED_NOW.getTime() - 42 * 86_400_000)
    const stale = initialState(sixWeeksAgo)
    expect(daysUntil(activeSprint(stale.sprints)!.endDate, FIXED_NOW)).toBe(9 - 42)

    const fresh = viaShell(stale, { type: "reset", nowMs: FIXED_NOW_MS })
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
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW)).toEqual(state)
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

  it("a saved copy never brings its own clock (there is none in it: the clock lives in the shell)", () => {
    const saved = initialState(new Date(FIXED_NOW_MS - 3 * DAY))
    const shell = shellReducer(
      { ...initialShell(initialState(FIXED_NOW), FIXED_NOW_MS), persisted: true },
      { type: "hydrate", result: { state: saved, status: "saved" }, nowMs: FIXED_NOW_MS - 3 * DAY }
    )
    expect(shell.nowMs).toBe(FIXED_NOW_MS)
    expect(shell.data.sprints).toEqual(saved.sprints)
    expect(shell.data).not.toHaveProperty("now")
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

  it("rejects a malformed sprint; the clock is not part of the copy at all", () => {
    const s1 = good()
    s1.sprints[0] = { ...s1.sprints[0], status: "paused" } as never
    expect(isState(s1)).toBe(false)
    const s2 = good()
    s2.sprints[0] = { ...s2.sprints[0], endDate: "soon" }
    expect(isState(s2)).toBe(false)
    // A stray `now` is ignored, never read: the page keeps its own instant.
    expect(isState({ ...good(), now: "later" })).toBe(true)
    expect(parseState({ ...good(), now: "later" })).not.toHaveProperty("now")
  })

  it("dates must be strict ISO instants that round-trip, not merely parseable", () => {
    const s1 = good()
    s1.issues[0] = { ...s1.issues[0], createdAt: "2026-08-27" } // a day, not an instant
    expect(isState(s1)).toBe(false)
    const s2 = good()
    s2.sprints[0] = { ...s2.sprints[0], startDate: "2026-08-27T14:00:00Z" } // no millis → not canonical
    expect(isState(s2)).toBe(false)
    const s3 = good()
    s3.issues[0].activity[0] = { ...s3.issues[0].activity[0], at: "yesterday" }
    expect(isState(s3)).toBe(false)
  })

  it("validates every activity entry and comment, and strips unknown fields", () => {
    const base = good().issues[0]
    const withComment = {
      ...base,
      comments: [{ id: "c1", actorId: "rashad", body: "ok", at: "2026-08-27T15:00:00.000Z", extra: "dropped" }],
      activity: [...base.activity, { id: "a9", actorId: "may", verb: "closed", at: "2026-08-27T15:00:00.000Z" }],
      mystery: 42,
    }
    const parsed = parseIssue(withComment)!
    expect(parsed).not.toBeNull()
    expect(parsed).not.toHaveProperty("mystery")
    expect(parsed.comments[0]).toEqual({ id: "c1", actorId: "rashad", body: "ok", at: "2026-08-27T15:00:00.000Z" })
    expect(parsed.activity.at(-1)).toEqual({ id: "a9", actorId: "may", verb: "closed", at: "2026-08-27T15:00:00.000Z" })

    for (const bad of [
      { comments: [{ id: "c1", actorId: "rashad", at: "2026-08-27T15:00:00.000Z" }] }, // no body
      { comments: [{ id: "c1", actorId: 7, body: "x", at: "2026-08-27T15:00:00.000Z" }] },
      { comments: [{ id: "c1", actorId: "rashad", body: "x", at: "soon" }] },
      { comments: [null] },
      { comments: "none" },
      { activity: [{ id: "a1", actorId: "rashad", at: "2026-08-27T15:00:00.000Z" }] }, // no verb
      { activity: [{ id: "a1", actorId: "rashad", verb: 1, at: "2026-08-27T15:00:00.000Z" }] },
      { description: 12 },
      { project: ["Billing"] },
      { blockerReason: false },
    ]) {
      expect(parseIssue({ ...base, ...bad }), JSON.stringify(bad)).toBeNull()
    }
  })

  it("rejects a copy whose counter would collide, duplicate keys, or two active sprints", () => {
    const s1 = good()
    expect(parseState({ ...s1, nextKey: 1 })).toBeNull()
    const s2 = good()
    s2.issues[1] = { ...s2.issues[1], key: s2.issues[0].key }
    expect(parseState(s2)).toBeNull()
    const s3 = good()
    s3.sprints = s3.sprints.map((sp) => ({ ...sp, status: "active" as const }))
    expect(parseState(s3)).toBeNull()
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

  it("a copy that fails validation loads as the seed without writing; the first real save parks it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ issues: "nope" })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw) // load() is pure
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW)).toEqual(initialState(FIXED_NOW))
    saveState(window.localStorage, initialState(FIXED_NOW))
    expect(issuesStorage.rejected(window.localStorage)[0].raw).toBe(raw)
    expect(loadState(window.localStorage)).not.toBeNull()
  })

  it("Reset reads the shared clock, not the request's: the seed is dated from the click", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    try {
      mount() // served at FIXED_NOW (27 Aug)
      await hydrated()
      expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
      act(() => screen.getByRole("button", { name: "reset" }).click())
      expect(screen.getByTestId("now")).toHaveTextContent("2026-10-07T18:00:00.000Z")
      expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    } finally {
      vi.useRealTimers()
    }
  })

  it("another tab's Reset re-seeds this tab from now(), not from the request", async () => {
    mount()
    await hydrated()
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      act(() => fireStorageEvent(STORAGE_KEY, null))
      expect(screen.getByTestId("now")).toHaveTextContent("2026-10-07T18:00:00.000Z")
      expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    } finally {
      vi.useRealTimers()
    }
  })

  it("the saved copy carries no clock", async () => {
    mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(saved).not.toHaveProperty("now")
    expect(Object.keys(saved).sort()).toEqual(["issues", "nextKey", "sprints"])
  })

  it("re-hydrates when another tab writes the key, keeping this page's clock; re-seeds when another tab Resets", async () => {
    mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")

    const theirs = reducer(initialState(new Date(FIXED_NOW_MS - DAY)), {
      type: "patch-issue",
      key: "CHLK-404",
      patch: { priority: "low" },
      at: AT,
    })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("none") // theirs wins, ours is gone
    expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")

    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")
    expect(screen.getByTestId("days-left")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
  })

  it("two tabs on one storage: an edit in A reaches B and the writes settle at one", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(
      <>
        <IssuesProvider nowMs={FIXED_NOW_MS}>
          <div data-tab="a"><Probe /></div>
        </IssuesProvider>
        <IssuesProvider nowMs={FIXED_NOW_MS + 60_000}>
          <div data-tab="b"><Probe /></div>
        </IssuesProvider>
      </>
    )
    const tab = (id: string) => document.querySelector(`[data-tab=${id}]`) as HTMLElement
    const text = (id: string, testId: string) => tab(id).querySelector(`[data-testid=${testId}]`)!.textContent
    await screen.findAllByText("true", { selector: "[data-testid=persisted]" })
    expect(setItem).not.toHaveBeenCalled()

    act(() => (tab("a").querySelector("button") as HTMLButtonElement).click())
    expect(setItem).toHaveBeenCalledTimes(1)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(text("b", "priority")).toBe("low")
    // B keeps its own clock and writes nothing back — even though its `now`
    // differs from A's, the saved copy has no clock to disagree about.
    expect(text("b", "now")).toBe(new Date(FIXED_NOW_MS + 60_000).toISOString())
    expect(setItem).toHaveBeenCalledTimes(1)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(setItem).toHaveBeenCalledTimes(1)
  })
})
