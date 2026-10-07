import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CLINICS_MOCK_DAY, seedClinics, type ClinicInput } from "@/lib/clinics"
import { initialShell, type LoadResult } from "@/lib/persistence"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
import {
  ClinicsProvider,
  STORAGE_KEY,
  clinicsStorage,
  initialState,
  isState,
  loadState,
  parseState,
  reducer,
  saveState,
  shellReducer,
  shellToday,
  stripState,
  useClinics,
  type State,
} from "@/components/clinics/clinics-store"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const TODAY = CLINICS_MOCK_DAY
/** Noon Central on the mock day. */
const NOW_MS = new Date("2026-08-28T17:00:00.000Z").getTime()

const KATY: ClinicInput = {
  name: " Katy spring install ",
  date: "2026-09-05",
  host: "Katy ISD",
  city: "Katy",
  type: "staff-meeting",
  attendance: "planned",
  collected: { leads: 0, emails: 0, demos: 0 },
  owner: "Trip",
  notes: "",
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
  it("starts with the eight seed clinics and the next id after them", () => {
    const s = initialState(TODAY)
    expect(s.clinics).toEqual(seedClinics(TODAY))
    expect(s.nextId).toBe(9)
  })

  it("adds a normalised clinic with the next id and bumps the counter", () => {
    const s = reducer(initialState(TODAY), { type: "add", input: KATY })
    expect(s.clinics).toHaveLength(9)
    expect(s.clinics.at(-1)).toEqual({ id: "clinic-9", ...KATY, name: "Katy spring install" })
    expect(s.nextId).toBe(10)
  })

  it("updates a clinic in place and is a no-op when nothing changed", () => {
    const start = reducer(initialState(TODAY), { type: "add", input: KATY })
    const same = reducer(start, { type: "update", id: "clinic-9", input: KATY })
    expect(same).toBe(start)
    const changed = reducer(start, {
      type: "update",
      id: "clinic-9",
      input: { ...KATY, attendance: "attended", collected: { leads: 12, emails: 9, demos: 2 } },
    })
    expect(changed).not.toBe(start)
    expect(changed.clinics.at(-1)!.collected).toEqual({ leads: 12, emails: 9, demos: 2 })
    expect(changed.clinics.at(-1)!.id).toBe("clinic-9")
    expect(reducer(start, { type: "update", id: "clinic-404", input: KATY })).toBe(start)
  })

  it("sets attendance and is a no-op when it already is that", () => {
    const start = initialState(TODAY)
    const s = reducer(start, { type: "set-attendance", id: "clinic-1", attendance: "attended" })
    expect(s.clinics[0].attendance).toBe("attended")
    expect(reducer(s, { type: "set-attendance", id: "clinic-1", attendance: "attended" })).toBe(s)
    expect(reducer(start, { type: "set-attendance", id: "nope", attendance: "attended" })).toBe(start)
  })

  it("removes by id and is a no-op for an unknown id; the counter never goes back", () => {
    const start = reducer(initialState(TODAY), { type: "add", input: KATY })
    const s = reducer(start, { type: "remove", id: "clinic-9" })
    expect(s.clinics).toHaveLength(8)
    expect(s.nextId).toBe(10)
    expect(reducer(s, { type: "remove", id: "clinic-9" })).toBe(s)
  })

})

describe("shellReducer (the shared persistence shell around the list)", () => {
  const fresh = initialShell(initialState(TODAY), NOW_MS)

  it("hydrate takes the saved copy whole and keeps the clock; an empty result (nothing saved, or a Reset elsewhere) re-seeds around the event's instant and moves it", () => {
    const edited = reducer(initialState(TODAY), { type: "remove", id: "clinic-1" })
    const s = shellReducer(fresh, hydrate(edited, noonMs("2026-09-30")))
    expect(s.data).toEqual(edited)
    expect(s).toMatchObject({ persisted: true, edited: false, saved: true, saveFailed: false, edits: 0, nowMs: NOW_MS })
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

  it("a hydrate never moves the edit counter, so it can never cause a write; a local unsaved edit wins over an incoming copy", () => {
    const edited = shellReducer(fresh, { type: "add", input: KATY })
    // Not yet saved: the incoming copy is ignored, ours stays and stays dirty,
    // so the pending save overwrites theirs rather than theirs discarding ours.
    const racing = shellReducer(edited, hydrate(initialState(TODAY)))
    expect(racing.edits).toBe(1)
    expect(racing.data).toBe(edited.data)
    expect(racing.edited).toBe(true)
    // Once saved, a hydrate adopts the copy and clears `edited` without moving `edits`.
    const settled = shellReducer(shellReducer(edited, { type: "save-result", ok: true }), hydrate(initialState(TODAY)))
    expect(settled.edits).toBe(1)
    expect(settled.data).toEqual(initialState(TODAY))
    expect(settled.edited).toBe(false)
  })

  it("reset regenerates the seed around the given instant, moves the clock and returns to the never-edited state", () => {
    const s = shellReducer(shellReducer(fresh, { type: "add", input: KATY }), { type: "reset", nowMs: noonMs("2026-10-07") })
    expect(s.data).toEqual(initialState("2026-10-07"))
    expect(shellToday(s)).toBe("2026-10-07")
    expect(s).toMatchObject({ edited: false, saved: false, saveFailed: false })
  })

  it("a no-op edit returns the same shell, so nothing re-renders or writes", () => {
    const shell = shellReducer(fresh, hydrate(null))
    expect(shellReducer(shell, { type: "set-attendance", id: "clinic-1", attendance: "planned" })).toBe(shell)
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove", id: "clinic-1" })
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
    ["clinics not an array", { ...good, clinics: {} }],
    ["a malformed row", { ...good, clinics: [{ ...good.clinics[0], type: "webinar" }] }],
    ["a row with an impossible date", { ...good, clinics: [{ ...good.clinics[0], date: "2026-02-30" }] }],
    ["a row with a bad nested count", { ...good, clinics: [{ ...good.clinics[0], collected: { leads: "12", emails: 0, demos: 0 } }] }],
    ["duplicate ids", { ...good, clinics: [good.clinics[0], good.clinics[0]] }],
    ["nextId not above the highest id", { ...good, nextId: 8 }],
    ["nextId fractional", { ...good, nextId: 9.5 }],
    ["nextId missing", (() => { const { nextId: _n, ...rest } = good; void _n; return rest })()],
    ["nextId a string", { ...good, nextId: "9" }],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the seed, an edited copy and an empty list", () => {
    expect(isState(good)).toBe(true)
    expect(isState(reducer(good, { type: "add", input: KATY }))).toBe(true)
    expect(isState({ clinics: [], nextId: 1 })).toBe(true)
    // Unknown keys do not fail validation; they are stripped on the way in.
    expect(isState({ ...good, extra: 1 })).toBe(true)
  })

  it("stripState / parseState drop unknown keys at both levels; parseState rejects a bad copy", () => {
    const dirty = { ...good, extra: 1, clinics: [{ ...good.clinics[0], bogus: true }] } as unknown as State
    const clean = stripState(dirty)
    expect(Object.keys(clean)).toEqual(["clinics", "nextId"])
    expect("bogus" in clean.clinics[0]).toBe(false)
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
    expect(clinicsStorage.rejected(window.localStorage)).toEqual([])
    expect(loadState(window.localStorage) ?? initialState(TODAY)).toEqual(initialState(TODAY))
    setItem.mockRestore()
    saveState(window.localStorage, good)
    expect(clinicsStorage.rejected(window.localStorage).map((c) => c.raw)).toEqual([raw])
    expect(loadState(window.localStorage)).toEqual(good)
  })
})

describe("localStorage", () => {
  it("uses the v1 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.clinics.v1")
  })

  it("loadState returns null when nothing is saved and the stripped copy when there is", () => {
    expect(loadState(window.localStorage)).toBeNull()
    const edited = reducer(initialState(TODAY), { type: "add", input: KATY })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...edited, extra: 1 }))
    expect(loadState(window.localStorage)).toEqual(edited)
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = reducer(initialState(TODAY), { type: "add", input: KATY })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    // A different copy, so the byte comparison does not short-circuit the write.
    const other = reducer(s, { type: "remove", id: "clinic-1" })
    expect(saveState(quotaExceededStorage() as unknown as Storage, other)).toBe(false)
  })

  it("saving the identical copy again is a no-op write (the shared save compares bytes)", () => {
    const s = initialState(TODAY)
    expect(saveState(window.localStorage, s)).toBe(true)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})

/* ---------------------------------------------------------------- provider */

function Probe({ label = "" }: { label?: string }) {
  const { today, clinics, nextId, persisted, edited, saved, saveFailed, addClinic, updateClinic, setAttendance, removeClinic, resetDemoData } =
    useClinics()
  return (
    <div data-testid={`probe${label}`}>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="status">{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid="today">{today}</span>
      <span data-testid="count">{clinics.length}</span>
      <span data-testid="next">{nextId}</span>
      <span data-testid="names">{clinics.map((c) => c.name).join("|")}</span>
      <span data-testid="attendance">{clinics.map((c) => c.attendance).join(",")}</span>
      <button type="button" onClick={() => addClinic(KATY)}>add</button>
      <button type="button" onClick={() => setAttendance("clinic-1", "attended")}>attend</button>
      <button type="button" onClick={() => setAttendance("clinic-1", "planned")}>noop</button>
      <button type="button" onClick={() => updateClinic("clinic-2", { ...seedClinics(today)[1], notes: "edited" })}>edit</button>
      <button type="button" onClick={() => removeClinic("clinic-3")}>remove</button>
      <button type="button" onClick={resetDemoData}>reset</button>
    </div>
  )
}

const mount = (nowMs = NOW_MS) =>
  render(
    <ClinicsProvider nowMs={nowMs}>
      <Probe />
    </ClinicsProvider>
  )

/** How many times anything wrote to localStorage while `fn` ran. */
function countingSetItem() {
  const calls: string[] = []
  const original = Storage.prototype.setItem
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
    calls.push(k)
    return original.call(this, k, v)
  })
  return { calls, restore: () => spy.mockRestore() }
}

describe("ClinicsProvider", () => {
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
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove", id: "clinic-1" }))
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
  })

  it("a hydrate from a saved copy never triggers a save", () => {
    saveState(window.localStorage, reducer(initialState(TODAY), { type: "remove", id: "clinic-1" }))
    const writes = countingSetItem()
    mount()
    expect(writes.calls).toEqual([])
    writes.restore()
  })

  it("persists edits (saved=true), skips a write that would not change the bytes, rehydrates after a remount, and Reset clears the key", () => {
    const writes = countingSetItem()
    const first = mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Katy spring install"')
    expect(writes.calls).toEqual([STORAGE_KEY])

    // A no-op edit: same shell, no render, no write.
    act(() => screen.getByRole("button", { name: "noop" }).click())
    expect(writes.calls).toHaveLength(1)

    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    expect(writes.calls).toHaveLength(1)

    // Reset reads the shared clock, not the request's: a tab opened on the
    // 28th and Reset on 7 Oct re-seeds around 7 Oct and "today" moves.
    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("names")).toHaveTextContent("Houston Offensive Staff Clinic")
    expect(writes.calls).toHaveLength(1)
    vi.useRealTimers()
    writes.restore()
  })

  it("opened at 23:30 CT and Reset after midnight: the seed and today move to the new day", () => {
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    act(() => screen.getByRole("button", { name: "add" }).click())
    // 00:30 CT on 8 Oct.
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
    act(() => screen.getByRole("button", { name: "attend" }).click())
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"attended"')
  })

  it("re-hydrates when another tab writes the key, without writing back", () => {
    mount()
    const writes = countingSetItem()
    const theirs = reducer(initialState(TODAY), { type: "remove", id: "clinic-1" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
    // Only the simulated other tab wrote.
    expect(writes.calls).toEqual([STORAGE_KEY])
    writes.restore()
  })

  it("a storage event with the key removed (Reset elsewhere) re-seeds this tab from now() and clears edited", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    const writes = countingSetItem()
    window.localStorage.removeItem(STORAGE_KEY)
    // The other tab's Reset happened on 7 Oct; this tab re-seeds around that day.
    vi.useFakeTimers({ now: new Date(noonMs("2026-10-07")), toFake: ["Date"] })
    act(() => fireStorageEvent(STORAGE_KEY, null))
    vi.useRealTimers()
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("names")).not.toHaveTextContent("Katy")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(writes.calls).toEqual([])

    // An empty-string value is treated the same as a removed key.
    act(() => screen.getByRole("button", { name: "add" }).click())
    window.localStorage.setItem(STORAGE_KEY, "")
    act(() => fireStorageEvent(STORAGE_KEY, ""))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    writes.restore()
  })

  it("a corrupt copy written by another tab leaves this tab on the seed, writes nothing, and is parked by the next real save", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    const writes = countingSetItem()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    act(() => fireStorageEvent(STORAGE_KEY, "{not json"))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
    expect(writes.calls).toEqual([STORAGE_KEY]) // only the simulated other tab
    expect(clinicsStorage.rejected(window.localStorage)).toEqual([])
    act(() => screen.getByRole("button", { name: "attend" }).click())
    expect(clinicsStorage.rejected(window.localStorage)[0]?.raw).toBe("{not json")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"attended"')
    writes.restore()
  })

  describe("two tabs", () => {
    /**
     * Two providers over the one localStorage, with the cross-tab `storage`
     * event relayed by hand (jsdom does not fire it across documents). The
     * invariant: every write comes from a user edit; a hydrate never
     * answers with a write, so the count settles.
     */
    function mountTwo() {
      render(
        <>
          <ClinicsProvider nowMs={NOW_MS}>
            <Probe label="A" />
          </ClinicsProvider>
          <ClinicsProvider nowMs={NOW_MS}>
            <Probe label="B" />
          </ClinicsProvider>
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
      // B hydrated; A received its own bytes back too. Neither wrote.
      relay()
      relay()
      expect(writes.calls).toHaveLength(1)
      expect(a.getByTestId("status")).toHaveTextContent("edited=false saved=true")

      act(() => b.getByRole("button", { name: "attend" }).click())
      expect(writes.calls).toHaveLength(2)
      relay()
      expect(a.getByTestId("attendance").textContent).toMatch(/^attended,/)
      relay()
      expect(writes.calls).toHaveLength(2)

      // Reset in A clears the key; B hears it and re-seeds without writing.
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
      act(() => a.getByRole("button", { name: "attend" }).click())
      relay()
      // B now holds the same data. B "re-saving" the same attendance is a
      // reducer no-op; even a different path to identical bytes is skipped.
      act(() => b.getByRole("button", { name: "attend" }).click())
      expect(writes.calls).toHaveLength(1)
      writes.restore()
    })
  })
})
