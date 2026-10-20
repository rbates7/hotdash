import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { activeSprint, daysUntil } from "@/lib/issues"
import { buildIssues, buildSprints } from "@/lib/issues-fixture"
import { founderBoard, storeFounderBoard } from "@/test/workplace"
import {
  IssuesProvider,
  STORAGE_KEY,
  clearEntries,
  dropSeed,
  hasEntries,
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

import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const AT = "2026-08-27T15:00:00.000Z"

describe("reducer", () => {
  it("edits priority and project on an issue", () => {
    let state = founderBoard(FIXED_NOW)
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-904",
      patch: { priority: "low", project: "Billing" },
      at: AT,
    })
    const issue = state.issues.find((i) => i.key === "CHLK-904")!
    expect(issue.priority).toBe("low")
    expect(issue.project).toBe("Billing")
    expect(issue.updatedAt).toBe(AT)
  })

  it("clears a project back to none", () => {
    let state = founderBoard(FIXED_NOW)
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-904",
      patch: { project: "Sharing" },
      at: AT,
    })
    state = reducer(state, {
      type: "patch-issue",
      key: "CHLK-904",
      patch: { project: undefined },
      at: AT,
    })
    expect(state.issues.find((i) => i.key === "CHLK-904")!.project).toBeUndefined()
  })

  it("keys a created issue on a fresh board after the old demo's keys and keeps its project", () => {
    const state = reducer(initialState(FIXED_NOW), {
      type: "create-issue",
      at: AT,
      input: {
        title: "Test",
        status: "todo",
        priority: "high",
        assigneeId: null,
        sprintId: null,
        labels: [],
        project: "Imports",
      },
    })
    expect(state.issues[0].key).toBe("CHLK-422")
    expect(state.issues[0].project).toBe("Imports")
  })

  it("refuses to start a second active sprint", () => {
    const state = reducer(founderBoard(FIXED_NOW), { type: "start-sprint", id: "sprint-15" })
    expect(state.sprints.filter((s) => s.status === "active")).toHaveLength(1)
    expect(state.sprints.find((s) => s.id === "sprint-15")!.status).toBe("planned")
  })

  it("reset empties the board, dated from the moment of the reset", () => {
    const state = reducer(founderBoard(FIXED_NOW), {
      type: "patch-issue",
      key: "CHLK-904",
      patch: { priority: "low" },
      at: AT,
    })
    const later = FIXED_NOW_MS + 3 * 86_400_000
    const shell = shellReducer({ ...initialShell(state, FIXED_NOW_MS), persisted: true }, { type: "reset", nowMs: later })
    expect(shell.data).toEqual(initialState(new Date(later)))
    expect(shell.nowMs).toBe(later)
  })
})

describe("no seed rows (Rashad's Oct 16 rule)", () => {
  it("a fresh board has no tickets and no sprints, and keys start after the old demo's", () => {
    for (const at of [FIXED_NOW, new Date("2027-01-15T03:00:00Z")]) {
      expect(initialState(at)).toEqual({ issues: [], sprints: [], nextKey: 422 })
    }
  })

  it("drops every demo ticket and sprint from an old saved copy, edited or not, and keeps the founder's own", () => {
    const demo = buildIssues(FIXED_NOW)
    const edited = demo.map((i) => (i.key === "CHLK-404" ? { ...i, priority: "low" as const, title: "Mine now?" } : i))
    const mine = founderBoard(FIXED_NOW)
    const own = { ...mine.issues[0], sprintId: "sprint-4" }
    const old = {
      issues: [...edited, own, ...mine.issues.slice(1)],
      sprints: [...buildSprints(FIXED_NOW), ...mine.sprints.map((s) => ({ ...s, status: "planned" as const }))],
      nextKey: 930,
    }
    const parsed = parseState(old)!
    expect(parsed.issues.map((i) => i.key)).toEqual(mine.issues.map((i) => i.key))
    expect(parsed.issues.some((i) => /^CHLK-4\d\d$/.test(i.key))).toBe(false)
    expect(parsed.sprints.map((s) => s.id)).toEqual(["sprint-14", "sprint-15"])
    // A founder ticket planned into a demo sprint goes back to the backlog.
    expect(parsed.issues[0].sprintId).toBeNull()
    expect(parsed.nextKey).toBe(930)
  })

  it("a copy holding only the demo loads as an empty board; the key counter never moves back", () => {
    const old = { issues: buildIssues(FIXED_NOW), sprints: buildSprints(FIXED_NOW), nextKey: 422 }
    expect(parseState(old)).toEqual({ issues: [], sprints: [], nextKey: 422 })
    expect(dropSeed({ issues: [], sprints: [], nextKey: 5 }).nextKey).toBe(5) // nothing to drop: unchanged
    expect(dropSeed({ ...old, nextKey: 422 }).nextKey).toBe(422)
  })

  it("leaves a founder-only copy untouched (same object)", () => {
    const mine = founderBoard(FIXED_NOW)
    expect(dropSeed(mine)).toBe(mine)
  })
})

describe("Clear my entries is per screen (Bugs and Agent Workplace share the store)", () => {
  const board = () => founderBoard(FIXED_NOW)
  const bugKeys = (s: { issues: { key: string; labels: string[] }[] }) =>
    s.issues.filter((i) => i.labels.includes("bug")).map((i) => i.key)

  it("Agent Workplace's Clear deletes its tickets and sprints and keeps every bug ticket", () => {
    const before = board()
    const after = clearEntries(before, "workplace")
    expect(after.issues.map((i) => i.key)).toEqual(bugKeys(before))
    expect(bugKeys(before).length).toBeGreaterThan(0)
    expect(after.sprints).toEqual([])
    // A bug that sat in a cleared sprint goes back to the backlog, not away.
    expect(after.issues.every((i) => i.sprintId === null)).toBe(true)
    expect(after.nextKey).toBe(before.nextKey)
    expect(hasEntries(after, "workplace")).toBe(false)
    expect(hasEntries(after, "bugs")).toBe(true)
  })

  it("Bugs' Clear deletes only bug tickets and leaves the board and its sprints", () => {
    const before = board()
    const after = clearEntries(before, "bugs")
    expect(bugKeys(after)).toEqual([])
    expect(after.issues).toHaveLength(before.issues.length - bugKeys(before).length)
    expect(after.sprints).toEqual(before.sprints)
    expect(hasEntries(after, "bugs")).toBe(false)
    expect(hasEntries(after, "workplace")).toBe(true)
  })

  it("in the shell: a partial Clear saves the rest as an edit; clearing the last entries is a reset", () => {
    const shell = { ...initialShell(board(), FIXED_NOW_MS), persisted: true, saved: true }
    const partial = shellReducer(shell, { type: "clear", scope: "workplace", nowMs: FIXED_NOW_MS + 1 })
    expect(partial.edits).toBe(shell.edits + 1)
    expect(partial.nowMs).toBe(FIXED_NOW_MS)
    const empty = shellReducer(partial, { type: "clear", scope: "bugs", nowMs: FIXED_NOW_MS + 2 })
    expect(empty.data.issues).toEqual([])
    expect(empty.saved).toBe(false)
    expect(empty.edited).toBe(false)
    expect(empty.nowMs).toBe(FIXED_NOW_MS + 2)
  })
})

describe("localStorage round trip", () => {
  it("saves and loads the same state", () => {
    const state = reducer(founderBoard(FIXED_NOW), {
      type: "patch-issue",
      key: "CHLK-904",
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
  const { issues, sprints, now, persisted, edited, saved, saveFailed, patchIssue, resetDemoData, clearEntries } = useIssues()
  const issue = issues.find((i) => i.key === "CHLK-904")
  const sprint = activeSprint(sprints)
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="count">{issues.length}</span>
      <span data-testid="keys">{issues.map((i) => i.key).join(",")}</span>
      <span data-testid="priority">{issue?.priority ?? "none"}</span>
      <span data-testid="project">{issue?.project ?? "none"}</span>
      <span data-testid="now">{now.toISOString()}</span>
      <span data-testid="days-left">{sprint ? daysUntil(sprint.endDate, now) : "none"}</span>
      <button
        type="button"
        onClick={() => patchIssue("CHLK-904", { priority: "low", project: "Billing" })}
      >
        edit
      </button>
      <button type="button" onClick={resetDemoData}>
        reset
      </button>
      <button type="button" onClick={() => clearEntries("workplace")}>
        clear workplace
      </button>
      <button type="button" onClick={() => clearEntries("bugs")}>
        clear bugs
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
    storeFounderBoard(FIXED_NOW)
    const first = mount()
    await hydrated()
    expect(screen.getByTestId("priority")).toHaveTextContent("urgent")

    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"priority":"low"')

    // Simulate a reload: tear the tree down and mount a fresh provider.
    first.unmount()
    mount()
    await hydrated()
    expect(screen.getByTestId("priority")).toHaveTextContent("low")
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")
  })

  it("starts empty when nothing is saved: no seed tickets, no sprints", async () => {
    mount()
    await hydrated()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("days-left")).toHaveTextContent("none")
  })

  it("an old copy with the demo board loads without it, keeping the founder's tickets", async () => {
    const mine = founderBoard(FIXED_NOW)
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ issues: [...buildIssues(FIXED_NOW), mine.issues[3]], sprints: buildSprints(FIXED_NOW), nextKey: 922 })
    )
    mount()
    await hydrated()
    expect(screen.getByTestId("keys")).toHaveTextContent(/^CHLK-904$/)
  })
})

describe("IssuesProvider persistence policy (M1)", () => {
  it("writes nothing until the first real edit", async () => {
    mount()
    await hydrated()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
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
    expect(screen.getByTestId("days-left")).toHaveTextContent("none")
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    // And the stale v1 copy was neither read nor promoted.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("a 10-day-old v2 save with edits loads, measured against today", async () => {
    const tenDaysAgo = new Date(FIXED_NOW_MS - 10 * DAY)
    const edited = reducer(founderBoard(tenDaysAgo), {
      type: "patch-issue",
      key: "CHLK-904",
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
  })

  it("Reset clears the saved copy so the next load is an empty board again", async () => {
    storeFounderBoard(FIXED_NOW)
    const first = mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("count")).toHaveTextContent("0")

    first.unmount()
    mount()
    await hydrated()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
  })
})

describe("Clear my entries in the provider (item 9: Workplace's Clear keeps the founder's bugs)", () => {
  it("Agent Workplace's Clear saves the bug tickets and drops the rest; a reload still has the bugs", async () => {
    const board = storeFounderBoard(FIXED_NOW)
    const bugs = board.issues.filter((i) => i.labels.includes("bug")).map((i) => i.key)
    const first = mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "clear workplace" }).click())
    expect(screen.getByTestId("keys")).toHaveTextContent(bugs.join(","))
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(saved.issues.map((i: { key: string }) => i.key)).toEqual(bugs)
    expect(saved.sprints).toEqual([])

    first.unmount()
    mount()
    await hydrated()
    expect(screen.getByTestId("keys")).toHaveTextContent(bugs.join(","))
  })

  it("clearing both screens' entries clears the key: never-edited again", async () => {
    storeFounderBoard(FIXED_NOW)
    mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "clear workplace" }).click())
    act(() => screen.getByRole("button", { name: "clear bugs" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
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
    } finally {
      vi.useRealTimers()
    }
  })

  it("a saved copy never brings its own clock (there is none in it: the clock lives in the shell)", () => {
    const saved = founderBoard(new Date(FIXED_NOW_MS - 3 * DAY))
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
  const good = () => founderBoard(FIXED_NOW)

  it("accepts a well-formed copy", () => {
    expect(isState(good())).toBe(true)
  })

  it("reads labels as a set: a doubled `bug` label is one bug", () => {
    const state = good()
    state.issues[3] = { ...state.issues[3], labels: ["bug", "editor", "bug"] }
    expect(parseState(state)!.issues[3].labels).toEqual(["bug", "editor"])
  })

  it("strips unknown label values and treats a missing field as none", () => {
    const state = good()
    state.issues[3] = { ...state.issues[3], labels: ["bug", 7, "editor"] as unknown as string[] }
    expect(parseState(state)!.issues[3].labels).toEqual(["bug", "editor"])
    const stripped = { ...state.issues[3] }
    delete (stripped as { labels?: string[] }).labels
    state.issues[3] = stripped
    expect(parseState(state)!.issues[3].labels).toEqual([])
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

  it("falls back to an empty board when a saved issue is bad", async () => {
    const state = good()
    state.issues[3] = { ...state.issues[3], priority: "p0" } as never
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    expect(loadState(window.localStorage)).toBeNull()
    mount()
    await hydrated()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
  })
})


describe("shared persistence policy (Workplace)", () => {
  it("exposes edited / saved / saveFailed: nothing saved until the first edit", async () => {
    mount()
    await hydrated()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
  })

  it("reports a failed save", async () => {
    storeFounderBoard(FIXED_NOW)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    await hydrated()
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(quotaExceededStorage().setItem)
    try {
      act(() => screen.getByRole("button", { name: "edit" }).click())
      expect(screen.getByTestId("status")).toHaveTextContent(/edited=true saved=\w+ failed=true/)
      expect(screen.getByTestId("priority")).toHaveTextContent("low") // the edit still works this session
    } finally {
      spy.mockRestore()
    }
  })

  it("a copy that fails validation loads as an empty board without writing; the first real save parks it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ issues: "nope" })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw) // load() is pure
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW)).toEqual(initialState(FIXED_NOW))
    saveState(window.localStorage, founderBoard(FIXED_NOW))
    expect(issuesStorage.rejected(window.localStorage)[0].raw).toBe(raw)
    expect(loadState(window.localStorage)).not.toBeNull()
  })

  it("Reset reads the shared clock, not the request's: the empty board is dated from the click", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    try {
      mount() // served at FIXED_NOW (27 Aug)
      await hydrated()
      expect(screen.getByTestId("now")).toHaveTextContent(FIXED_NOW.toISOString())
      act(() => screen.getByRole("button", { name: "reset" }).click())
      expect(screen.getByTestId("now")).toHaveTextContent("2026-10-07T18:00:00.000Z")
    } finally {
      vi.useRealTimers()
    }
  })

  it("another tab's Clear empties this tab from now(), not from the request", async () => {
    storeFounderBoard(FIXED_NOW)
    mount()
    await hydrated()
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      act(() => fireStorageEvent(STORAGE_KEY, null))
      expect(screen.getByTestId("now")).toHaveTextContent("2026-10-07T18:00:00.000Z")
      expect(screen.getByTestId("count")).toHaveTextContent("0")
    } finally {
      vi.useRealTimers()
    }
  })

  it("the saved copy carries no clock", async () => {
    storeFounderBoard(FIXED_NOW)
    mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(saved).not.toHaveProperty("now")
    expect(Object.keys(saved).sort()).toEqual(["issues", "nextKey", "sprints"])
  })

  it("re-hydrates when another tab writes the key, keeping this page's clock; empties when another tab clears it", async () => {
    storeFounderBoard(FIXED_NOW)
    mount()
    await hydrated()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(screen.getByTestId("project")).toHaveTextContent("Billing")

    const theirs = reducer(founderBoard(new Date(FIXED_NOW_MS - DAY)), {
      type: "patch-issue",
      key: "CHLK-904",
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
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
  })

  it("two tabs on one storage: an edit in A reaches B and the writes settle at one", async () => {
    storeFounderBoard(FIXED_NOW)
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
