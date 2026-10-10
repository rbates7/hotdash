import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { seedInitiatives, type InitiativeInput } from "@/lib/community-development"
import { initialShell, type LoadResult } from "@/lib/persistence"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
import {
  CommunityDevelopmentProvider,
  STORAGE_KEY,
  communityDevelopmentStorage,
  initialState,
  isState,
  loadState,
  parseState,
  reducer,
  saveState,
  shellReducer,
  shellToday,
  stripState,
  useCommunityDevelopment,
  type State,
} from "@/components/community-development/community-development-store"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const TODAY = "2026-10-07"
/** Noon Central on that day. */
const NOW_MS = new Date("2026-10-07T17:00:00.000Z").getTime()

const GEAR: InitiativeInput = {
  name: " Gear drive ",
  type: "donation",
  partner: "Yates High School",
  date: "2026-10-20",
  cadence: "",
  status: "planned",
  owner: "Rashad",
  impact: "helmets",
}

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
  it("starts with the eight seed initiatives and the next id after them", () => {
    const s = initialState(TODAY)
    expect(s.initiatives).toEqual(seedInitiatives(TODAY))
    expect(s.nextId).toBe(9)
  })

  it("adds a normalised initiative with the next id and bumps the counter", () => {
    const s = reducer(initialState(TODAY), { type: "add", input: GEAR })
    expect(s.initiatives).toHaveLength(9)
    expect(s.initiatives.at(-1)).toEqual({
      id: "initiative-9",
      ...GEAR,
      name: "Gear drive",
    })
    expect(s.nextId).toBe(10)
  })

  it("updates an initiative in place and is a no-op when nothing changed", () => {
    const start = reducer(initialState(TODAY), { type: "add", input: GEAR })
    const same = reducer(start, { type: "update", id: "initiative-9", input: GEAR })
    expect(same).toBe(start)
    const changed = reducer(start, {
      type: "update",
      id: "initiative-9",
      input: { ...GEAR, status: "active", impact: "12 iPads" },
    })
    expect(changed).not.toBe(start)
    expect(changed.initiatives.at(-1)!.status).toBe("active")
    expect(changed.initiatives.at(-1)!.id).toBe("initiative-9")
    expect(reducer(start, { type: "update", id: "initiative-404", input: GEAR })).toBe(start)
  })

  it("sets status and is a no-op when it already is that", () => {
    const start = initialState(TODAY)
    const s = reducer(start, { type: "set-status", id: "initiative-1", status: "active" })
    expect(s.initiatives[0].status).toBe("active")
    expect(reducer(s, { type: "set-status", id: "initiative-1", status: "active" })).toBe(s)
    expect(reducer(start, { type: "set-status", id: "nope", status: "active" })).toBe(start)
  })

  it("removes by id and is a no-op for an unknown id; the counter never goes back", () => {
    const start = reducer(initialState(TODAY), { type: "add", input: GEAR })
    const s = reducer(start, { type: "remove", id: "initiative-9" })
    expect(s.initiatives).toHaveLength(8)
    expect(s.nextId).toBe(10)
    expect(reducer(s, { type: "remove", id: "initiative-9" })).toBe(s)
  })
})

describe("shellReducer (the shared persistence shell around the list)", () => {
  const fresh = initialShell(initialState(TODAY), NOW_MS)

  it("hydrate takes the saved copy whole and keeps the clock; an empty result re-seeds around the event's instant", () => {
    const edited = reducer(initialState(TODAY), { type: "remove", id: "initiative-1" })
    const s = shellReducer(fresh, hydrate(edited, noonMs("2026-09-30")))
    expect(s.data).toEqual(edited)
    expect(s).toMatchObject({
      persisted: true,
      edited: false,
      saved: true,
      saveFailed: false,
      edits: 0,
      nowMs: NOW_MS,
    })
    expect(shellToday(s)).toBe(TODAY)
    const reseeded = shellReducer({ ...s, edited: true, saveFailed: true }, hydrate(null, noonMs("2026-10-07")))
    expect(reseeded.data).toEqual(initialState("2026-10-07"))
    expect(shellToday(reseeded)).toBe("2026-10-07")
    expect(reseeded).toMatchObject({ persisted: true, edited: false, saved: false, saveFailed: false })
  })

  it("shellToday is the Central day of the shell clock: 23:30 CT is still the 7th", () => {
    expect(shellToday({ nowMs: LATE_EVENING_CT_MS })).toBe("2026-10-07")
    expect(LATE_EVENING_CT.getUTCDate()).toBe(8)
    const s = shellReducer(fresh, hydrate(null, LATE_EVENING_CT_MS))
    expect(s.data).toEqual(initialState("2026-10-07"))
  })

  it("a hydrate never moves the edit counter; a local unsaved edit wins over an incoming copy", () => {
    const edited = shellReducer(fresh, { type: "add", input: GEAR })
    const racing = shellReducer(edited, hydrate(initialState(TODAY)))
    expect(racing.edits).toBe(1)
    expect(racing.data).toBe(edited.data)
    expect(racing.edited).toBe(true)
    const settled = shellReducer(shellReducer(edited, { type: "save-result", ok: true }), hydrate(initialState(TODAY)))
    expect(settled.edits).toBe(1)
    expect(settled.data).toEqual(initialState(TODAY))
    expect(settled.edited).toBe(false)
  })

  it("reset regenerates the seed around the given instant and returns to the never-edited state", () => {
    const s = shellReducer(shellReducer(fresh, { type: "add", input: GEAR }), {
      type: "reset",
      nowMs: noonMs("2026-10-07"),
    })
    expect(s.data).toEqual(initialState("2026-10-07"))
    expect(shellToday(s)).toBe("2026-10-07")
    expect(s).toMatchObject({ edited: false, saved: false, saveFailed: false })
  })

  it("a no-op edit returns the same shell, so nothing re-renders or writes", () => {
    const shell = shellReducer(fresh, hydrate(null))
    expect(shellReducer(shell, { type: "set-status", id: "initiative-1", status: "planned" })).toBe(
      shell
    )
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove", id: "initiative-1" })
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
  const good = initialState(TODAY)
  const cases: [string, unknown][] = [
    ["not an object", "nope"],
    ["an array", [good]],
    ["initiatives not an array", { ...good, initiatives: {} }],
    ["a malformed row", { ...good, initiatives: [{ ...good.initiatives[0], type: "webinar" }] }],
    [
      "a row with an impossible date",
      { ...good, initiatives: [{ ...good.initiatives[0], date: "2026-02-30" }] },
    ],
    [
      "a row with neither date nor cadence",
      { ...good, initiatives: [{ ...good.initiatives[0], date: null, cadence: "" }] },
    ],
    ["duplicate ids", { ...good, initiatives: [good.initiatives[0], good.initiatives[0]] }],
    ["nextId not above the highest id", { ...good, nextId: 8 }],
    ["nextId fractional", { ...good, nextId: 9.5 }],
    [
      "nextId missing",
      (() => {
        const { nextId: _n, ...rest } = good
        void _n
        return rest
      })(),
    ],
    ["nextId a string", { ...good, nextId: "9" }],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the seed, an edited copy and an empty list", () => {
    expect(isState(good)).toBe(true)
    expect(isState(reducer(good, { type: "add", input: GEAR }))).toBe(true)
    expect(isState({ initiatives: [], nextId: 1 })).toBe(true)
    expect(isState({ ...good, extra: 1 })).toBe(true)
  })

  it("stripState / parseState drop unknown keys; parseState rejects a bad copy", () => {
    const dirty = {
      ...good,
      extra: 1,
      initiatives: [{ ...good.initiatives[0], bogus: true }],
    } as unknown as State
    const clean = stripState(dirty)
    expect(Object.keys(clean)).toEqual(["initiatives", "nextId"])
    expect("bogus" in clean.initiatives[0]).toBe(false)
    expect(parseState(dirty)).toEqual(clean)
    expect(parseState({ ...good, nextId: 1 })).toBeNull()
  })

  it("a rejected copy gives the page the seed without writing; the first real save parks it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(loadState(window.localStorage)).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(communityDevelopmentStorage.rejected(window.localStorage)).toEqual([])
    expect(loadState(window.localStorage) ?? initialState(TODAY)).toEqual(initialState(TODAY))
    setItem.mockRestore()
    saveState(window.localStorage, good)
    expect(communityDevelopmentStorage.rejected(window.localStorage).map((c) => c.raw)).toEqual([raw])
    expect(loadState(window.localStorage)).toEqual(good)
  })
})

describe("localStorage", () => {
  it("uses the v1 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.community-development.v1")
  })

  it("loadState returns null when nothing is saved and the stripped copy when there is", () => {
    expect(loadState(window.localStorage)).toBeNull()
    const edited = reducer(initialState(TODAY), { type: "add", input: GEAR })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...edited, extra: 1 }))
    expect(loadState(window.localStorage)).toEqual(edited)
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = reducer(initialState(TODAY), { type: "add", input: GEAR })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    const other = reducer(s, { type: "remove", id: "initiative-1" })
    expect(saveState(quotaExceededStorage() as unknown as Storage, other)).toBe(false)
  })

  it("saving the identical copy again is a no-op write", () => {
    const s = initialState(TODAY)
    expect(saveState(window.localStorage, s)).toBe(true)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

function Probe({ label = "" }: { label?: string }) {
  const {
    today,
    initiatives,
    nextId,
    persisted,
    edited,
    saved,
    saveFailed,
    addInitiative,
    updateInitiative,
    setStatus,
    removeInitiative,
    resetDemoData,
  } = useCommunityDevelopment()
  return (
    <div data-testid={`probe${label}`}>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="today">{today}</span>
      <span data-testid="count">{initiatives.length}</span>
      <span data-testid="next">{nextId}</span>
      <span data-testid="names">{initiatives.map((r) => r.name).join("|")}</span>
      <span data-testid="row-status">{initiatives.map((r) => r.status).join(",")}</span>
      <button type="button" onClick={() => addInitiative(GEAR)}>
        add
      </button>
      <button type="button" onClick={() => setStatus("initiative-1", "active")}>
        activate
      </button>
      <button type="button" onClick={() => setStatus("initiative-1", "planned")}>
        noop
      </button>
      <button
        type="button"
        onClick={() =>
          updateInitiative("initiative-2", { ...seedInitiatives(today)[1], impact: "edited" })
        }
      >
        edit
      </button>
      <button type="button" onClick={() => removeInitiative("initiative-3")}>
        remove
      </button>
      <button type="button" onClick={resetDemoData}>
        reset
      </button>
    </div>
  )
}

const mount = (nowMs = NOW_MS) =>
  render(
    <CommunityDevelopmentProvider nowMs={nowMs}>
      <Probe />
    </CommunityDevelopmentProvider>
  )

function countingSetItem() {
  const calls: string[] = []
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    k: string,
    v: string
  ) {
    calls.push(k)
    return original.call(this, k, v)
  })
  return { calls, restore: () => spy.mockRestore() }
}

describe("CommunityDevelopmentProvider", () => {
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
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove", id: "initiative-1" }))
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
  })

  it("a hydrate from a saved copy never triggers a save", () => {
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove", id: "initiative-1" }))
    const writes = countingSetItem()
    mount()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("persists edits, skips a no-op write, rehydrates after a remount, and Reset clears the key", () => {
    const writes = countingSetItem()
    const first = mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Gear drive"')
    expect(writes.calls).toEqual([STORAGE_KEY])

    act(() => screen.getByRole("button", { name: "noop" }).click())
    expect(writes.calls).toHaveLength(1)

    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toHaveLength(1)

    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("names")).toHaveTextContent("Youth flag-football")
    expect(writes.calls).toHaveLength(1)
    vi.useRealTimers()
    writes.restore()
  })

  it("opened at 23:30 CT and Reset after midnight: the seed and today move to the new day", () => {
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    act(() => screen.getByRole("button", { name: "add" }).click())
    vi.useFakeTimers({ now: new Date("2026-10-08T05:30:00.000Z"), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-08")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
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
    act(() => screen.getByRole("button", { name: "activate" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"active"')
  })

  it("re-hydrates when another tab writes the key, without writing back", () => {
    mount()
    const writes = countingSetItem()
    const theirs = reducer(initialState(TODAY), { type: "remove", id: "initiative-1" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toEqual([STORAGE_KEY])
    writes.restore()
  })

  it("a storage event with the key removed (Reset elsewhere) re-seeds this tab from now()", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    const writes = countingSetItem()
    window.localStorage.removeItem(STORAGE_KEY)
    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => fireStorageEvent(STORAGE_KEY, null))
    vi.useRealTimers()
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("names")).not.toHaveTextContent("Gear drive")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(writes.calls).toEqual([])

    act(() => screen.getByRole("button", { name: "add" }).click())
    window.localStorage.setItem(STORAGE_KEY, "")
    act(() => fireStorageEvent(STORAGE_KEY, ""))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    writes.restore()
  })

  it("a corrupt copy written by another tab leaves this tab on the seed and is parked by the next save", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    const writes = countingSetItem()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    act(() => fireStorageEvent(STORAGE_KEY, "{not json"))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
    expect(writes.calls).toEqual([STORAGE_KEY])
    expect(communityDevelopmentStorage.rejected(window.localStorage)).toEqual([])
    act(() => screen.getByRole("button", { name: "activate" }).click())
    expect(communityDevelopmentStorage.rejected(window.localStorage)[0]?.raw).toBe("{not json")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"active"')
    writes.restore()
  })

  describe("two tabs", () => {
    function mountTwo() {
      render(
        <>
          <CommunityDevelopmentProvider nowMs={NOW_MS}>
            <Probe label="A" />
          </CommunityDevelopmentProvider>
          <CommunityDevelopmentProvider nowMs={NOW_MS}>
            <Probe label="B" />
          </CommunityDevelopmentProvider>
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
      expect(b.getByTestId("count")).toHaveTextContent("9")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=true")
      relay()
      relay()
      expect(writes.calls).toHaveLength(1)
      expect(a.getByTestId("status")).toHaveTextContent("edited=false saved=true")

      act(() => b.getByRole("button", { name: "activate" }).click())
      expect(writes.calls).toHaveLength(2)
      relay()
      expect(a.getByTestId("row-status").textContent).toMatch(/^active,/)
      relay()
      expect(writes.calls).toHaveLength(2)

      act(() => a.getByRole("button", { name: "reset" }).click())
      act(() => fireStorageEvent(STORAGE_KEY, null))
      expect(b.getByTestId("count")).toHaveTextContent("8")
      expect(b.getByTestId("status")).toHaveTextContent("edited=false saved=false")
      expect(a.getByTestId("status")).toHaveTextContent("edited=false saved=false")
      expect(writes.calls).toHaveLength(2)
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
      writes.restore()
    })

    it("an edit that lands on the bytes already stored is not written again", () => {
      const { a, b } = mountTwo()
      const writes = countingSetItem()
      act(() => a.getByRole("button", { name: "activate" }).click())
      relay()
      act(() => b.getByRole("button", { name: "activate" }).click())
      expect(writes.calls).toHaveLength(1)
      writes.restore()
    })
  })
})
