import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DESK_MOCK_DAY, SEED_SCRATCH, seedTodos, type TodoInput } from "@/lib/my-desk"
import { initialShell, type LoadResult } from "@/lib/persistence"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
import {
  MyDeskProvider,
  STORAGE_KEY,
  deskStorage,
  initialState,
  isState,
  loadState,
  parseState,
  reducer,
  saveState,
  shellReducer,
  shellToday,
  stripState,
  useMyDesk,
  type State,
} from "@/components/my-desk/my-desk-store"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

/** Noon Central on the day the mock was drawn. */
const TODAY = DESK_MOCK_DAY
const NOW_MS = new Date("2026-08-26T17:00:00.000Z").getTime()

const WALK: TodoInput = {
  title: "  Walk the dog  ",
  note: "  after clinic  ",
  done: false,
}

const addWalk = (state: State, today = TODAY) =>
  reducer(state, { type: "add", input: WALK, today })

/** Noon Central on `day`, as an instant. */
const noonMs = (day: string) => Date.parse(`${day}T17:00:00.000Z`)
const hydrate = (state: State | null, nowMs = NOW_MS) => {
  const result: LoadResult<State> = state
    ? { state, status: "saved" }
    : { state: null, status: "empty" }
  return { type: "hydrate" as const, result, nowMs }
}

afterEach(() => vi.restoreAllMocks())

describe("reducer", () => {
  it("starts with the seven seed to-dos, the mock scratch, and the next id after them", () => {
    const s = initialState(NOW_MS)
    expect(s.todos).toEqual(seedTodos())
    expect(s.scratch).toBe(SEED_SCRATCH)
    expect(s.nextId).toBe(8)
    expect(s.scratchUpdatedAt).toBe(new Date(NOW_MS).toISOString())
  })

  it("adds a normalised to-do with the next id and bumps the counter", () => {
    const s = addWalk(initialState(NOW_MS))
    expect(s.todos).toHaveLength(8)
    expect(s.todos.at(-1)).toEqual({
      id: "todo-8",
      title: "Walk the dog",
      note: "after clinic",
      done: false,
      createdOn: TODAY,
      doneOn: null,
    })
    expect(s.nextId).toBe(9)
  })

  it("refuses to add a blank title", () => {
    const start = initialState(NOW_MS)
    expect(reducer(start, { type: "add", input: { title: "   ", note: "", done: false }, today: TODAY })).toBe(start)
  })

  it("updates a to-do in place and is a no-op when nothing changed", () => {
    const start = addWalk(initialState(NOW_MS))
    const same = reducer(start, { type: "update", id: "todo-8", input: WALK, today: TODAY })
    expect(same).toBe(start)
    const changed = reducer(start, {
      type: "update",
      id: "todo-8",
      input: { ...WALK, note: "before dinner", done: true },
      today: TODAY,
    })
    expect(changed).not.toBe(start)
    expect(changed.todos.at(-1)).toMatchObject({
      note: "before dinner",
      done: true,
      id: "todo-8",
      createdOn: TODAY,
      doneOn: TODAY,
    })
    expect(reducer(start, { type: "update", id: "todo-404", input: WALK, today: TODAY })).toBe(start)
  })

  it("toggles done and is a no-op for an unknown id", () => {
    const start = initialState(NOW_MS)
    const s = reducer(start, { type: "toggle", id: "todo-1", today: TODAY })
    expect(s.todos[0].done).toBe(true)
    expect(s.todos[0].doneOn).toBe(TODAY)
    expect(reducer(s, { type: "toggle", id: "todo-1", today: TODAY }).todos[0].done).toBe(false)
    expect(reducer(s, { type: "toggle", id: "todo-1", today: TODAY }).todos[0].doneOn).toBeNull()
    expect(reducer(start, { type: "toggle", id: "nope", today: TODAY })).toBe(start)
  })

  it("removes by id and is a no-op for an unknown id; the counter never goes back", () => {
    const start = addWalk(initialState(NOW_MS))
    const s = reducer(start, { type: "remove", id: "todo-8" })
    expect(s.todos).toHaveLength(7)
    expect(s.nextId).toBe(9)
    expect(reducer(s, { type: "remove", id: "todo-8" })).toBe(s)
  })

  it("restores a removed to-do under its original id", () => {
    const start = initialState(NOW_MS)
    const removed = start.todos[0]
    const without = reducer(start, { type: "remove", id: removed.id })
    const back = reducer(without, { type: "restore", todo: removed })
    expect(back.todos.at(-1)).toEqual(removed)
    expect(reducer(start, { type: "restore", todo: removed })).toBe(start)
  })

  it("set-scratch writes the text and timestamp, and is a no-op when the text is unchanged", () => {
    const start = initialState(NOW_MS)
    const at = "2026-08-26T18:00:00.000Z"
    const s = reducer(start, { type: "set-scratch", text: "A new thought", at })
    expect(s.scratch).toBe("A new thought")
    expect(s.scratchUpdatedAt).toBe(at)
    expect(reducer(s, { type: "set-scratch", text: "A new thought", at: "2026-08-26T19:00:00.000Z" })).toBe(s)
    expect(reducer(start, { type: "set-scratch", text: "x", at: "not-an-instant" })).toBe(start)
  })
})

describe("shellReducer (the shared persistence shell around the desk)", () => {
  const fresh = initialShell(initialState(NOW_MS), NOW_MS)

  it("hydrate takes the saved copy whole and keeps the clock; an empty result re-seeds around the event's instant", () => {
    const edited = reducer(initialState(NOW_MS), { type: "remove", id: "todo-1" })
    const s = shellReducer(fresh, hydrate(edited, noonMs("2026-09-30")))
    expect(s.data).toEqual(edited)
    expect(s).toMatchObject({ persisted: true, edited: false, saved: true, saveFailed: false, edits: 0, nowMs: NOW_MS })
    expect(shellToday(s)).toBe(TODAY)
    const reseeded = shellReducer({ ...s, edited: true, saveFailed: true }, hydrate(null, noonMs("2026-10-07")))
    expect(reseeded.data).toEqual(initialState(noonMs("2026-10-07")))
    expect(shellToday(reseeded)).toBe("2026-10-07")
    expect(reseeded).toMatchObject({ persisted: true, edited: false, saved: false, saveFailed: false })
  })

  it("shellToday is the Central day of the shell clock: 23:30 CT is still the 7th", () => {
    expect(shellToday({ nowMs: LATE_EVENING_CT_MS })).toBe("2026-10-07")
    expect(LATE_EVENING_CT.getUTCDate()).toBe(8)
    const s = shellReducer(fresh, hydrate(null, LATE_EVENING_CT_MS))
    expect(s.data.todos).toEqual(seedTodos("2026-10-07"))
    expect(shellToday(s)).toBe("2026-10-07")
  })

  it("a hydrate never moves the edit counter; a local unsaved edit wins over an incoming copy", () => {
    const edited = shellReducer(fresh, { type: "add", input: WALK, today: TODAY })
    const racing = shellReducer(edited, hydrate(initialState(NOW_MS)))
    expect(racing.edits).toBe(1)
    expect(racing.data).toBe(edited.data)
    expect(racing.edited).toBe(true)
    const settled = shellReducer(shellReducer(edited, { type: "save-result", ok: true }), hydrate(initialState(NOW_MS)))
    expect(settled.edits).toBe(1)
    expect(settled.data).toEqual(initialState(NOW_MS))
    expect(settled.edited).toBe(false)
  })

  it("reset regenerates the seed around the given instant and returns to the never-edited state", () => {
    const s = shellReducer(shellReducer(fresh, { type: "add", input: WALK, today: TODAY }), {
      type: "reset",
      nowMs: noonMs("2026-10-07"),
    })
    expect(s.data).toEqual(initialState(noonMs("2026-10-07")))
    expect(shellToday(s)).toBe("2026-10-07")
    expect(s).toMatchObject({ edited: false, saved: false, saveFailed: false })
  })

  it("a no-op edit returns the same shell, so nothing re-renders or writes", () => {
    const shell = shellReducer(fresh, hydrate(null))
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove", id: "todo-1" })
    expect(edited.edited).toBe(true)
    expect(edited.edits).toBe(1)
  })

  it("save-result records success or failure without touching data", () => {
    const ok = shellReducer(fresh, { type: "save-result", ok: true })
    expect(ok).toMatchObject({ saved: true, saveFailed: false })
    expect(ok.data).toBe(fresh.data)
    const failed = shellReducer(ok, { type: "save-result", ok: false })
    expect(failed).toMatchObject({ saved: true, saveFailed: true })
  })
})

describe("isState rejects a bad saved copy", () => {
  const good = initialState(NOW_MS)
  const cases: [string, unknown][] = [
    ["not an object", "nope"],
    ["an array", [good]],
    ["todos not an array", { ...good, todos: {} }],
    ["a malformed row", { ...good, todos: [{ ...good.todos[0], done: "yes" }] }],
    ["a row with a blank title", { ...good, todos: [{ ...good.todos[0], title: "" }] }],
    ["a row missing createdOn", { ...good, todos: [{ ...good.todos[0], createdOn: undefined }] }],
    ["a done row with no doneOn", { ...good, todos: [{ ...good.todos[0], done: true, doneOn: null }] }],
    ["duplicate ids", { ...good, todos: [good.todos[0], good.todos[0]] }],
    ["nextId not above the highest id", { ...good, nextId: 7 }],
    ["nextId fractional", { ...good, nextId: 8.5 }],
    ["nextId missing", (() => { const { nextId: _n, ...rest } = good; void _n; return rest })()],
    ["scratch missing", (() => { const { scratch: _s, ...rest } = good; void _s; return rest })()],
    ["scratchUpdatedAt not an instant", { ...good, scratchUpdatedAt: "26 Aug" }],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the seed, an edited copy and an empty list", () => {
    expect(isState(good)).toBe(true)
    expect(isState(addWalk(good))).toBe(true)
    expect(
      isState({
        todos: [],
        nextId: 1,
        scratch: "",
        scratchUpdatedAt: "2026-08-26T17:00:00.000Z",
      })
    ).toBe(true)
    expect(isState({ ...good, extra: 1 })).toBe(true)
  })

  it("stripState / parseState drop unknown keys at both levels; parseState rejects a bad copy", () => {
    const dirty = { ...good, extra: 1, todos: [{ ...good.todos[0], bogus: true }] } as unknown as State
    const clean = stripState(dirty)
    expect(Object.keys(clean)).toEqual(["todos", "nextId", "scratch", "scratchUpdatedAt"])
    expect("bogus" in clean.todos[0]).toBe(false)
    expect(parseState(dirty)).toEqual(clean)
    expect(parseState({ ...good, nextId: 1 })).toBeNull()
  })

  it("a rejected copy gives the page the seed without writing (load is pure); the first real save parks it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(loadState(window.localStorage)).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(deskStorage.rejected(window.localStorage)).toEqual([])
    expect(loadState(window.localStorage) ?? initialState(NOW_MS)).toEqual(initialState(NOW_MS))
    setItem.mockRestore()
    saveState(window.localStorage, good)
    expect(deskStorage.rejected(window.localStorage).map((c) => c.raw)).toEqual([raw])
    expect(loadState(window.localStorage)).toEqual(good)
  })
})

describe("localStorage", () => {
  it("uses the v2 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.my-desk.v2")
  })

  it("loadState returns null when nothing is saved and the stripped copy when there is", () => {
    expect(loadState(window.localStorage)).toBeNull()
    const edited = addWalk(initialState(NOW_MS))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...edited, extra: 1 }))
    expect(loadState(window.localStorage)).toEqual(edited)
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = addWalk(initialState(NOW_MS))
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    const other = reducer(s, { type: "remove", id: "todo-1" })
    expect(saveState(quotaExceededStorage() as unknown as Storage, other)).toBe(false)
  })

  it("saving the identical copy again is a no-op write (the shared save compares bytes)", () => {
    const s = initialState(NOW_MS)
    expect(saveState(window.localStorage, s)).toBe(true)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

/* ---------------------------------------------------------------- provider */

function Probe({ label = "" }: { label?: string }) {
  const {
    today,
    todos,
    nextId,
    scratch,
    scratchSample,
    persisted,
    edited,
    saved,
    saveFailed,
    addTodo,
    updateTodo,
    toggleTodo,
    removeTodo,
    setScratch,
    resetDemoData,
  } = useMyDesk()
  return (
    <div data-testid={`probe${label}`}>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="today">{today}</span>
      <span data-testid="count">{todos.length}</span>
      <span data-testid="next">{nextId}</span>
      <span data-testid="titles">{todos.map((t) => t.title).join("|")}</span>
      <span data-testid="done">{todos.map((t) => String(t.done)).join(",")}</span>
      <span data-testid="scratch">{scratch}</span>
      <span data-testid="scratch-sample">{String(scratchSample)}</span>
      <button type="button" onClick={() => addTodo(WALK)}>
        add
      </button>
      <button type="button" onClick={() => toggleTodo("todo-1")}>
        toggle
      </button>
      <button type="button" onClick={() => toggleTodo("todo-1")}>
        noop-same-toggle-twice
      </button>
      <button
        type="button"
        onClick={() => updateTodo("todo-2", { title: seedTodos()[1].title, note: "edited", done: false })}
      >
        edit
      </button>
      <button type="button" onClick={() => removeTodo("todo-3")}>
        remove
      </button>
      <button type="button" onClick={() => setScratch("typed in scratch")}>
        scratch
      </button>
      <button type="button" onClick={resetDemoData}>
        reset
      </button>
    </div>
  )
}

const mount = (nowMs = NOW_MS) =>
  render(
    <MyDeskProvider nowMs={nowMs}>
      <Probe />
    </MyDeskProvider>
  )

function countingSetItem() {
  const calls: string[] = []
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
    calls.push(k)
    return original.call(this, k, v)
  })
  return { calls, restore: () => spy.mockRestore() }
}

describe("MyDeskProvider", () => {
  it("derives today from the request instant in Central time, not the machine zone", () => {
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
  })

  it("does not write the untouched seed on first load", () => {
    const writes = countingSetItem()
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("is hydrated before the first paint, so saved data never follows a flash of seed", () => {
    saveState(window.localStorage, reducer(initialState(NOW_MS), { type: "remove", id: "todo-1" }))
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("6")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(screen.getByTestId("titles")).not.toHaveTextContent("Call Aledo")
  })

  it("a hydrate from a saved copy never triggers a save", () => {
    saveState(window.localStorage, reducer(initialState(NOW_MS), { type: "remove", id: "todo-1" }))
    const writes = countingSetItem()
    mount()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("persists edits (saved=true), rehydrates after a remount, and Reset clears the key", () => {
    const writes = countingSetItem()
    const first = mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Walk the dog"')
    expect(writes.calls).toEqual([STORAGE_KEY])

    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toHaveLength(1)

    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("titles")).toHaveTextContent("Call Aledo")
    expect(writes.calls).toHaveLength(1)
    vi.useRealTimers()
    writes.restore()
  })

  it("opened at 23:30 CT and Reset after midnight: today moves to the new day", () => {
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    act(() => screen.getByRole("button", { name: "add" }).click())
    vi.useFakeTimers({ now: new Date("2026-10-08T05:30:00.000Z"), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-08")
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    vi.useRealTimers()
  })

  it("reports a failed save and never claims Saved; the next edit retries", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const full = quotaExceededStorage()
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(full.setItem)
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=false failed=true")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    spy.mockRestore()
    act(() => screen.getByRole("button", { name: "toggle" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Walk the dog"')
  })

  it("scratch edits persist and drop the sample flag", () => {
    mount()
    expect(screen.getByTestId("scratch-sample")).toHaveTextContent("true")
    act(() => screen.getByRole("button", { name: "scratch" }).click())
    expect(screen.getByTestId("scratch")).toHaveTextContent("typed in scratch")
    expect(screen.getByTestId("scratch-sample")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("typed in scratch")
  })

  it("re-hydrates when another tab writes the key, without writing back", () => {
    mount()
    const writes = countingSetItem()
    const theirs = reducer(initialState(NOW_MS), { type: "remove", id: "todo-1" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("count")).toHaveTextContent("6")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toEqual([STORAGE_KEY])
    writes.restore()
  })

  it("a storage event with the key removed (Reset elsewhere) re-seeds this tab from now()", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("8")

    const writes = countingSetItem()
    window.localStorage.removeItem(STORAGE_KEY)
    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => fireStorageEvent(STORAGE_KEY, null))
    vi.useRealTimers()
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("titles")).not.toHaveTextContent("Walk the dog")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("a corrupt copy written by another tab leaves this tab on the seed and is parked by the next real save", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    const writes = countingSetItem()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    act(() => fireStorageEvent(STORAGE_KEY, "{not json"))
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
    expect(writes.calls).toEqual([STORAGE_KEY])
    expect(deskStorage.rejected(window.localStorage)).toEqual([])
    act(() => screen.getByRole("button", { name: "toggle" }).click())
    expect(deskStorage.rejected(window.localStorage)[0]?.raw).toBe("{not json")
    writes.restore()
  })

  describe("two tabs", () => {
    function mountTwo() {
      render(
        <>
          <MyDeskProvider nowMs={NOW_MS}>
            <Probe label="A" />
          </MyDeskProvider>
          <MyDeskProvider nowMs={NOW_MS}>
            <Probe label="B" />
          </MyDeskProvider>
        </>
      )
      return { a: within(screen.getByTestId("probeA")), b: within(screen.getByTestId("probeB")) }
    }
    const relay = () => act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))

    it("edits in one tab reach the other, and the writes settle at one per edit", () => {
      const { a, b } = mountTwo()
      const writes = countingSetItem()

      act(() => a.getByRole("button", { name: "add" }).click())
      expect(writes.calls).toEqual([STORAGE_KEY])
      relay()
      expect(b.getByTestId("count")).toHaveTextContent("8")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=true")
      relay()
      relay()
      expect(writes.calls).toHaveLength(1)

      act(() => b.getByRole("button", { name: "toggle" }).click())
      expect(writes.calls).toHaveLength(2)
      relay()
      expect(a.getByTestId("done").textContent).toMatch(/^true,/)
      relay()
      expect(writes.calls).toHaveLength(2)

      act(() => a.getByRole("button", { name: "reset" }).click())
      act(() => fireStorageEvent(STORAGE_KEY, null))
      expect(b.getByTestId("count")).toHaveTextContent("7")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=false")
      expect(writes.calls).toHaveLength(2)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
      writes.restore()
    })
  })
})
