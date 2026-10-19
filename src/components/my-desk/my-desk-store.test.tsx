import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { now, todayIn } from "@/lib/clock"
import { DESK_MOCK_DAY, SEED_SCRATCH, seedTodos, type Todo, type TodoInput } from "@/lib/my-desk"
import { initialShell, type LoadResult } from "@/lib/persistence"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
import {
  MyDeskProvider,
  LEGACY_KEY,
  STORAGE_KEY,
  clearState,
  deskStorage,
  dropSeed,
  initialState,
  isState,
  legacyDesk,
  loadDesk,
  loadState,
  migrateV1,
  parseState,
  parseV1,
  reducer,
  saveState,
  shellReducer,
  shellToday,
  stripState,
  useMyDesk,
  type State,
  type V1State,
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

/**
 * The founder's own desk: three to-dos they added (ids after the old
 * seed's) and a note they typed. Tests that need rows start from this,
 * never from a seed.
 */
const MINE: State = {
  todos: [
    { id: "todo-8", title: "Book the bus", note: "Aledo trip", done: false, createdOn: TODAY, doneOn: null },
    { id: "todo-9", title: "Order cones", note: "", done: false, createdOn: TODAY, doneOn: null },
    {
      id: "todo-10",
      title: "Email the printer",
      note: "Proofs back Thursday",
      done: true,
      createdOn: TODAY,
      doneOn: TODAY,
    },
  ],
  nextId: 11,
  scratch: "Mine: call the printer back.",
  scratchUpdatedAt: new Date(NOW_MS).toISOString(),
}

/** What the old initialState wrote: the mock's seven rows and note, dated `day`. */
const oldSeedCopy = (day = TODAY): State => ({
  todos: seedTodos(day),
  nextId: 8,
  scratch: SEED_SCRATCH,
  scratchUpdatedAt: new Date(NOW_MS).toISOString(),
})

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
  it("starts empty: no to-dos, an empty note, and ids after the old seed's", () => {
    const s = initialState(NOW_MS)
    expect(s.todos).toEqual([])
    expect(s.scratch).toBe("")
    expect(s.nextId).toBe(8)
    expect(s.scratchUpdatedAt).toBe(new Date(NOW_MS).toISOString())
  })

  it("adds a normalised to-do with the next id and bumps the counter", () => {
    const s = addWalk(initialState(NOW_MS))
    expect(s.todos).toHaveLength(1)
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

  it("editing a carried row keeps createdOn; ticking it done stamps doneOn with today", () => {
    const yesterday = "2026-08-25"
    const carried: State = {
      ...initialState(NOW_MS),
      todos: [
        {
          id: "todo-20",
          title: "Finish the packet",
          note: "Aledo",
          done: false,
          createdOn: yesterday,
          doneOn: null,
        },
      ],
      nextId: 21,
    }
    const renamed = reducer(carried, {
      type: "update",
      id: "todo-20",
      input: { title: "Finish the Aledo packet", note: "Aledo", done: false },
      today: TODAY,
    })
    expect(renamed.todos[0]).toMatchObject({
      title: "Finish the Aledo packet",
      createdOn: yesterday,
      doneOn: null,
    })
    const ticked = reducer(renamed, {
      type: "update",
      id: "todo-20",
      input: { title: "Finish the Aledo packet", note: "Aledo", done: true },
      today: TODAY,
    })
    expect(ticked.todos[0]).toMatchObject({
      createdOn: yesterday,
      done: true,
      doneOn: TODAY,
    })
  })

  it("toggles done and is a no-op for an unknown id", () => {
    const start = MINE
    const s = reducer(start, { type: "toggle", id: "todo-8", today: TODAY })
    expect(s.todos[0].done).toBe(true)
    expect(s.todos[0].doneOn).toBe(TODAY)
    expect(reducer(s, { type: "toggle", id: "todo-8", today: TODAY }).todos[0].done).toBe(false)
    expect(reducer(s, { type: "toggle", id: "todo-8", today: TODAY }).todos[0].doneOn).toBeNull()
    expect(reducer(start, { type: "toggle", id: "nope", today: TODAY })).toBe(start)
  })

  it("removes by id and is a no-op for an unknown id; the counter never goes back", () => {
    const start = addWalk(MINE)
    const s = reducer(start, { type: "remove", id: "todo-11" })
    expect(s.todos).toHaveLength(3)
    expect(s.nextId).toBe(12)
    expect(reducer(s, { type: "remove", id: "todo-11" })).toBe(s)
  })

  it("restores a removed to-do under its original id", () => {
    const start = MINE
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

  it("hydrate takes the saved copy whole and keeps the clock; an empty result starts fresh around the event's instant", () => {
    const edited = reducer(MINE, { type: "remove", id: "todo-8" })
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
    expect(s.data).toEqual(initialState(LATE_EVENING_CT_MS))
    expect(s.data.todos).toEqual([])
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

  it("reset (Clear my entries) starts a fresh desk around the given instant and returns to the never-edited state", () => {
    const s = shellReducer(shellReducer(fresh, { type: "add", input: WALK, today: TODAY }), {
      type: "reset",
      nowMs: noonMs("2026-10-07"),
    })
    expect(s.data).toEqual(initialState(noonMs("2026-10-07")))
    expect(shellToday(s)).toBe("2026-10-07")
    expect(s).toMatchObject({ edited: false, saved: false, saveFailed: false })
  })

  it("a no-op edit returns the same shell, so nothing re-renders or writes", () => {
    const shell = shellReducer(fresh, hydrate(MINE))
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove", id: "todo-8" })
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
  const good = MINE
  const cases: [string, unknown][] = [
    ["not an object", "nope"],
    ["an array", [good]],
    ["todos not an array", { ...good, todos: {} }],
    ["a malformed row", { ...good, todos: [{ ...good.todos[0], done: "yes" }] }],
    ["a row with a blank title", { ...good, todos: [{ ...good.todos[0], title: "" }] }],
    ["a row missing createdOn", { ...good, todos: [{ ...good.todos[0], createdOn: undefined }] }],
    ["a done row with no doneOn", { ...good, todos: [{ ...good.todos[0], done: true, doneOn: null }] }],
    ["duplicate ids", { ...good, todos: [good.todos[0], good.todos[0]] }],
    ["nextId not above the highest id", { ...good, nextId: 10 }],
    ["nextId fractional", { ...good, nextId: 11.5 }],
    ["nextId missing", (() => { const { nextId: _n, ...rest } = good; void _n; return rest })()],
    ["scratch missing", (() => { const { scratch: _s, ...rest } = good; void _s; return rest })()],
    ["scratchUpdatedAt not an instant", { ...good, scratchUpdatedAt: "26 Aug" }],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the founder's copy, an edited copy, a fresh desk and an empty list", () => {
    expect(isState(good)).toBe(true)
    expect(isState(initialState(NOW_MS))).toBe(true)
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

  it("a rejected copy gives the page a fresh desk without writing (load is pure); the first real save parks it", () => {
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
    const other = reducer(s, { type: "remove", id: "todo-8" })
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

describe("dropSeed: a copy saved before the seed was removed", () => {
  const seedRow = (id: string): Todo => {
    const row = seedTodos().find((t) => t.id === id)
    if (!row) throw new Error(id)
    return row
  }

  it("drops every untouched seed to-do and the seed note; the counter stays past the seed", () => {
    const cleaned = dropSeed(oldSeedCopy())
    expect(cleaned.todos).toEqual([])
    expect(cleaned.scratch).toBe("")
    expect(cleaned.nextId).toBe(8)
    expect(isState(cleaned)).toBe(true)
  })

  it("ignores the seed's dates: it was re-dated on every load", () => {
    expect(dropSeed(oldSeedCopy("2026-10-07")).todos).toEqual([])
    const carried = { ...seedRow("todo-1"), createdOn: "2026-08-20" }
    expect(dropSeed({ ...MINE, todos: [carried, ...MINE.todos] }).todos).toEqual(MINE.todos)
  })

  it("keeps a seed to-do whose title or note the founder edited", () => {
    const retitled = { ...seedRow("todo-1"), title: "Call Aledo back" }
    const renoted = { ...seedRow("todo-2"), note: "Houston staff — two-pager" }
    const todos = seedTodos().map((t) => (t.id === "todo-1" ? retitled : t.id === "todo-2" ? renoted : t))
    expect(dropSeed({ ...oldSeedCopy(), todos }).todos).toEqual([retitled, renoted])
  })

  it("keeps a seed to-do the founder ticked, or unticked", () => {
    const ticked = { ...seedRow("todo-3"), done: true, doneOn: TODAY }
    const unticked = { ...seedRow("todo-5"), done: false, doneOn: null }
    const todos = seedTodos().map((t) => (t.id === "todo-3" ? ticked : t.id === "todo-5" ? unticked : t))
    expect(dropSeed({ ...oldSeedCopy(), todos }).todos).toEqual([ticked, unticked])
  })

  it("keeps the founder's own to-dos, in order, beside dropped seed rows", () => {
    const s = dropSeed({ ...MINE, todos: [seedRow("todo-1"), MINE.todos[0], seedRow("todo-6"), ...MINE.todos.slice(1)] })
    expect(s.todos).toEqual(MINE.todos)
    expect(s.scratch).toBe(MINE.scratch)
    expect(s.nextId).toBe(11)
  })

  it("clears the note only when it is the seed's character for character", () => {
    expect(dropSeed({ ...MINE, scratch: SEED_SCRATCH }).scratch).toBe("")
    const oneCharOff = SEED_SCRATCH.replace("Aledo", "Aledp")
    expect(oneCharOff).not.toBe(SEED_SCRATCH)
    expect(dropSeed({ ...MINE, scratch: oneCharOff }).scratch).toBe(oneCharOff)
    expect(dropSeed({ ...MINE, scratch: `${SEED_SCRATCH}\nmine` }).scratch).toBe(`${SEED_SCRATCH}\nmine`)
  })

  it("never moves the counter back, and lifts a low one past the seed's ids", () => {
    expect(dropSeed({ ...oldSeedCopy(), nextId: 15 }).nextId).toBe(15)
    const low: State = { ...oldSeedCopy(), todos: [seedRow("todo-1")], nextId: 2 }
    expect(isState(low)).toBe(true)
    expect(dropSeed(low)).toMatchObject({ todos: [], nextId: 8 })
  })

  it("returns the same object when there is nothing to drop", () => {
    expect(dropSeed(MINE)).toBe(MINE)
    const fresh = initialState(NOW_MS)
    expect(dropSeed(fresh)).toBe(fresh)
  })

  it("runs on load (parseState / loadState) and writes nothing back", () => {
    const old: State = { ...oldSeedCopy(), todos: [...seedTodos(), MINE.todos[0]], nextId: 9 }
    expect(parseState(old)).toEqual({ ...old, todos: [MINE.todos[0]], scratch: "" })
    const raw = JSON.stringify(old)
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(loadState(window.localStorage)?.todos).toEqual([MINE.todos[0]])
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })
})

/* ---------------------------------------------------------------- provider */

function Probe({ label = "" }: { label?: string }) {
  const {
    today,
    todos,
    nextId,
    scratch,
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
      <span data-testid="ids">{todos.map((t) => t.id).join("|")}</span>
      <span data-testid="titles">{todos.map((t) => t.title).join("|")}</span>
      <span data-testid="created">{todos.map((t) => t.createdOn).join("|")}</span>
      <span data-testid="done-on">{todos.map((t) => t.doneOn ?? "-").join("|")}</span>
      <span data-testid="done">{todos.map((t) => String(t.done)).join(",")}</span>
      <span data-testid="scratch">{scratch}</span>
      <button type="button" onClick={() => addTodo(WALK)}>
        add
      </button>
      <button type="button" onClick={() => toggleTodo("todo-8")}>
        toggle
      </button>
      <button
        type="button"
        onClick={() => updateTodo("todo-9", { title: MINE.todos[1].title, note: "edited", done: false })}
      >
        edit
      </button>
      <button type="button" onClick={() => removeTodo("todo-10")}>
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

  it("does not write the fresh desk on first load", () => {
    const writes = countingSetItem()
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("scratch")).toBeEmptyDOMElement()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("is hydrated before the first paint, so saved data never follows a flash of the empty desk", () => {
    saveState(window.localStorage, MINE)
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("3")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(screen.getByTestId("titles")).toHaveTextContent("Book the bus|Order cones|Email the printer")
    expect(screen.getByTestId("scratch")).toHaveTextContent(MINE.scratch)
  })

  it("an old copy loads without its untouched seed rows and writes nothing until a real edit", () => {
    const ticked = { ...seedTodos()[0], done: true, doneOn: TODAY }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...oldSeedCopy(), todos: [ticked, ...seedTodos().slice(1)] })
    )
    const writes = countingSetItem()
    mount()
    expect(screen.getByTestId("titles")).toHaveTextContent(/^Call Aledo$/)
    expect(screen.getByTestId("scratch")).toBeEmptyDOMElement()
    expect(writes.calls).toEqual([])
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(loadState(window.localStorage)?.todos.map((t) => t.id)).toEqual(["todo-1", "todo-8"])
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("Clinic follow-up")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("11-personnel")
    writes.restore()
  })

  it("a hydrate from a saved copy never triggers a save", () => {
    saveState(window.localStorage, MINE)
    const writes = countingSetItem()
    mount()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("persists edits (saved=true), rehydrates after a remount, and Clear my entries clears the key", () => {
    const writes = countingSetItem()
    const first = mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Walk the dog"')
    expect(writes.calls).toEqual([STORAGE_KEY])

    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("1")
    expect(screen.getByTestId("titles")).toHaveTextContent("Walk the dog")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toHaveLength(1)

    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("titles")).toBeEmptyDOMElement()
    expect(writes.calls).toHaveLength(1)
    vi.useRealTimers()
    writes.restore()
  })

  it("opened at 23:30 CT and cleared after midnight: today moves to the new day", () => {
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    act(() => screen.getByRole("button", { name: "add" }).click())
    vi.useFakeTimers({ now: new Date("2026-10-08T05:30:00.000Z"), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-08")
    expect(screen.getByTestId("count")).toHaveTextContent("0")
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
    // The unsaved Walk the dog is todo-8; ticking it is the next edit.
    act(() => screen.getByRole("button", { name: "toggle" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Walk the dog"')
  })

  it("scratch starts empty; typing persists it", () => {
    mount()
    expect(screen.getByTestId("scratch")).toBeEmptyDOMElement()
    act(() => screen.getByRole("button", { name: "scratch" }).click())
    expect(screen.getByTestId("scratch")).toHaveTextContent("typed in scratch")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("typed in scratch")
  })

  it("re-hydrates when another tab writes the key, without writing back", () => {
    mount()
    const writes = countingSetItem()
    const theirs = MINE
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("count")).toHaveTextContent("3")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toEqual([STORAGE_KEY])
    writes.restore()
  })

  it("a storage event with the key removed (Clear elsewhere) empties this tab from now()", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("1")

    const writes = countingSetItem()
    window.localStorage.removeItem(STORAGE_KEY)
    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => fireStorageEvent(STORAGE_KEY, null))
    vi.useRealTimers()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("titles")).not.toHaveTextContent("Walk the dog")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("a corrupt copy written by another tab leaves this tab on the empty desk and is parked by the next real save", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    const writes = countingSetItem()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    act(() => fireStorageEvent(STORAGE_KEY, "{not json"))
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
    expect(writes.calls).toEqual([STORAGE_KEY])
    expect(deskStorage.rejected(window.localStorage)).toEqual([])
    act(() => screen.getByRole("button", { name: "add" }).click())
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
      expect(b.getByTestId("count")).toHaveTextContent("1")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=true")
      relay()
      relay()
      expect(writes.calls).toHaveLength(1)

      act(() => b.getByRole("button", { name: "toggle" }).click())
      expect(writes.calls).toHaveLength(2)
      relay()
      expect(a.getByTestId("done")).toHaveTextContent(/^true$/)
      relay()
      expect(writes.calls).toHaveLength(2)

      act(() => a.getByRole("button", { name: "reset" }).click())
      act(() => fireStorageEvent(STORAGE_KEY, null))
      expect(b.getByTestId("count")).toHaveTextContent("0")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=false")
      expect(writes.calls).toHaveLength(2)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
      writes.restore()
    })
  })
})

const V1: V1State = {
  todos: [
    { id: "todo-1", title: "Call Aledo", note: "HC", done: false },
    { id: "todo-2", title: "Filed it", note: "", done: true },
  ],
  nextId: 9,
  scratch: "Keep this personal.",
  scratchUpdatedAt: "2026-08-26T17:00:00.000Z",
}

function writeV1(state: V1State | string = V1) {
  window.localStorage.setItem(LEGACY_KEY, typeof state === "string" ? state : JSON.stringify(state))
}

describe("v1 → v2 migration (loadDesk)", () => {
  it("parseV1 accepts the old shape and rejects a blank title", () => {
    expect(parseV1(V1)).toEqual(V1)
    expect(parseV1({ ...V1, todos: [{ ...V1.todos[0], title: "" }] })).toBeNull()
    expect(migrateV1(V1, TODAY)?.todos.map((t) => [t.id, t.createdOn, t.doneOn])).toEqual([
      ["todo-1", TODAY, null],
      ["todo-2", TODAY, TODAY],
    ])
  })

  it("(a) v1 only: the provider shows the v1 rows and scratch, dated today, and writes nothing", () => {
    writeV1()
    const writes = countingSetItem()
    mount()
    expect(screen.getByTestId("titles")).toHaveTextContent("Call Aledo|Filed it")
    expect(screen.getByTestId("ids")).toHaveTextContent("todo-1|todo-2")
    expect(screen.getByTestId("next")).toHaveTextContent("9")
    expect(screen.getByTestId("created")).toHaveTextContent(`${TODAY}|${TODAY}`)
    expect(screen.getByTestId("done-on")).toHaveTextContent(`-|${TODAY}`)
    expect(screen.getByTestId("scratch")).toHaveTextContent("Keep this personal.")
    expect(screen.getByTestId("titles")).not.toHaveTextContent("Clinic follow-up")
    expect(writes.calls).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(LEGACY_KEY)).not.toBeNull()
    writes.restore()
  })

  it("(b) the first edit writes v2 with the migrated rows and only then removes v1", () => {
    writeV1()
    mount()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    act(() => screen.getByRole("button", { name: "add" }).click())
    const saved = loadState(window.localStorage)
    expect(saved?.todos.map((t) => t.id)).toEqual(["todo-1", "todo-2", "todo-9"])
    expect(saved?.todos[0]).toMatchObject({ createdOn: TODAY, done: false, doneOn: null })
    expect(saved?.todos[1]).toMatchObject({ createdOn: TODAY, done: true, doneOn: TODAY })
    expect(saved?.scratch).toBe("Keep this personal.")
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it("(c) v1 and v2 both present: v2 wins, and v1 is removed on the next save", () => {
    writeV1()
    saveState(window.localStorage, MINE)
    writeV1()
    expect(loadDesk(window.localStorage, NOW_MS).state?.todos.map((t) => t.title)[0]).toBe("Book the bus")
    mount()
    expect(screen.getByTestId("titles")).toHaveTextContent("Book the bus")
    expect(screen.getByTestId("titles")).not.toHaveTextContent("Call Aledo")
    expect(window.localStorage.getItem(LEGACY_KEY)).not.toBeNull()
    act(() => screen.getByRole("button", { name: "edit" }).click())
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it("(d) corrupt v1 shows the empty desk; the first save parks the raw copy under v1.rejected", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    writeV1("{not a desk")
    const writes = countingSetItem()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(writes.calls).toEqual([])
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(legacyDesk.rejected(window.localStorage)[0]?.raw).toBe("{not a desk")
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(window.localStorage.getItem(`${LEGACY_KEY}.rejected`)).toContain("{not a desk")
    writes.restore()
  })

  it("(e) a v1 copy still holding the untouched seed migrates without it; edited seed rows stay", () => {
    const seedV1 = seedTodos().map(({ id, title, note, done }) => ({ id, title, note, done }))
    const old: V1State = {
      todos: [...seedV1.slice(0, 6), { ...seedV1[6], done: true }, { id: "todo-8", title: "Mine", note: "", done: false }],
      nextId: 9,
      scratch: SEED_SCRATCH,
      scratchUpdatedAt: "2026-08-26T17:00:00.000Z",
    }
    expect(migrateV1(old, TODAY)).toMatchObject({ nextId: 9, scratch: "" })
    expect(migrateV1(old, TODAY)?.todos.map((t) => [t.id, t.done])).toEqual([
      ["todo-7", true],
      ["todo-8", false],
    ])
    writeV1(old)
    mount()
    expect(screen.getByTestId("titles")).toHaveTextContent(/^Sketch Aledo install notes\|Mine$/)
    expect(screen.getByTestId("scratch")).toBeEmptyDOMElement()
  })

  it("(f) Clear my entries and clearState remove v1; a reload after clearing shows the empty desk", () => {
    writeV1()
    const first = mount()
    expect(screen.getByTestId("count")).toHaveTextContent("2")
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(screen.getByTestId("scratch")).toBeEmptyDOMElement()
    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    writeV1()
    clearState(window.localStorage)
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it("(g) a save that fails on quota leaves v1 in place", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    writeV1()
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
    })
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("failed=true")
    spy.mockRestore()
    expect(window.localStorage.getItem(LEGACY_KEY)).toBe(JSON.stringify(V1))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe("today advances past Central midnight in an open tab", () => {
  const wed = "2026-10-07"
  const thu = "2026-10-08"
  const at2359 = new Date("2026-10-08T04:59:00.000Z")
  const afterMidnight = new Date("2026-10-08T05:00:30.000Z")

  const overnight: State = {
    todos: [
      {
        id: "todo-8",
        title: "Finish the packet",
        note: "",
        done: false,
        createdOn: wed,
        doneOn: null,
      },
      {
        id: "todo-11",
        title: "Ticked Wed",
        note: "",
        done: true,
        createdOn: wed,
        doneOn: wed,
      },
    ],
    nextId: 12,
    scratch: "",
    scratchUpdatedAt: "2026-10-07T17:00:00.000Z",
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("23:59 CT Wed keeps a row ticked Wed; the timer at 00:00 CT Thu hides it and stamps new edits Thu", () => {
    expect(todayIn(at2359)).toBe(wed)
    expect(at2359.getUTCDate()).toBe(8)
    saveState(window.localStorage, overnight)
    vi.useFakeTimers({ now: at2359, toFake: ["Date", "setTimeout", "clearTimeout"] })
    mount(at2359.getTime())
    expect(screen.getByTestId("today")).toHaveTextContent(wed)
    expect(screen.getByTestId("titles")).toHaveTextContent("Finish the packet|Ticked Wed")

    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    expect(todayIn(now())).toBe(thu)
    expect(screen.getByTestId("today")).toHaveTextContent(thu)

    act(() => screen.getByRole("button", { name: "toggle" }).click())
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("done-on").textContent?.split("|")[0]).toBe(thu)
    expect(screen.getByTestId("created").textContent?.split("|").at(-1)).toBe(thu)
  })

  it("visibilitychange to visible after midnight moves today without a reload", () => {
    saveState(window.localStorage, overnight)
    vi.useFakeTimers({ now: at2359, toFake: ["Date", "setTimeout", "clearTimeout"] })
    mount(at2359.getTime())
    expect(screen.getByTestId("today")).toHaveTextContent(wed)
    vi.setSystemTime(afterMidnight)
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(screen.getByTestId("today")).toHaveTextContent(thu)
    act(() => {
      window.dispatchEvent(new Event("focus"))
    })
    expect(screen.getByTestId("today")).toHaveTextContent(thu)
  })
})
