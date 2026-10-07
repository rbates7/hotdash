import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CLINICS_MOCK_DAY, seedClinics, type ClinicInput } from "@/lib/clinics"
import type { LoadResult } from "@/lib/persistence"
import {
  ClinicsProvider,
  STORAGE_KEY,
  clinicsStorage,
  initialState,
  isState,
  loadState,
  loadStateOrSeed,
  matchesStored,
  reducer,
  saveState,
  shellReducer,
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

const hydrate = (state: State | null, today = TODAY) => {
  const result: LoadResult<State> = state
    ? { state, status: "saved" }
    : { state: null, status: "empty" }
  return { type: "hydrate" as const, result, today }
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

  it("hydrate takes the saved copy whole, stripped; an empty result re-seeds", () => {
    const edited = reducer(initialState(TODAY), { type: "remove", id: "clinic-1" })
    const dirty = { ...edited, extra: true } as unknown as State
    const s = reducer(initialState(TODAY), hydrate(dirty))
    expect(s).toEqual(edited)
    expect("extra" in s).toBe(false)
    expect(reducer(edited, hydrate(null, "2026-10-07"))).toEqual(initialState("2026-10-07"))
  })

  it("reset regenerates the seed around the given day", () => {
    const s = reducer(reducer(initialState(TODAY), { type: "add", input: KATY }), { type: "reset", today: "2026-10-07" })
    expect(s).toEqual(initialState("2026-10-07"))
  })
})

describe("shellReducer", () => {
  const fresh = { data: initialState(TODAY), hydrated: false, edited: false, saved: false, saveFailed: false }

  it("a hydrate marks the shell persisted, clears edited and reports whether the key held a copy", () => {
    const saved = shellReducer(fresh, hydrate(initialState(TODAY)))
    expect(saved).toMatchObject({ hydrated: true, edited: false, saved: true, saveFailed: false })
    const empty = shellReducer({ ...fresh, edited: true, saveFailed: true }, hydrate(null))
    expect(empty).toMatchObject({ hydrated: true, edited: false, saved: false, saveFailed: false })
  })

  it("a no-op edit returns the same shell, so nothing re-renders or writes", () => {
    const shell = shellReducer(fresh, hydrate(null))
    expect(shellReducer(shell, { type: "set-attendance", id: "clinic-1", attendance: "planned" })).toBe(shell)
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
    const edited = shellReducer(shell, { type: "remove", id: "clinic-1" })
    expect(edited.edited).toBe(true)
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

  it("stripState drops unknown keys at both levels", () => {
    const dirty = { ...good, extra: 1, clinics: [{ ...good.clinics[0], bogus: true }] } as unknown as State
    const clean = stripState(dirty)
    expect(Object.keys(clean)).toEqual(["clinics", "nextId"])
    expect("bogus" in clean.clinics[0]).toBe(false)
  })

  it("a rejected copy is parked under <key>.rejected and the page gets the seed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(clinicsStorage.rejectedKey)).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(initialState(TODAY))
  })
})

describe("localStorage", () => {
  it("uses the v1 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.clinics.v1")
  })

  it("loadStateOrSeed returns the seed when nothing is saved and the stripped copy when there is", () => {
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(initialState(TODAY))
    const edited = reducer(initialState(TODAY), { type: "add", input: KATY })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...edited, extra: 1 }))
    expect(loadStateOrSeed(window.localStorage, TODAY)).toEqual(edited)
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = reducer(initialState(TODAY), { type: "add", input: KATY })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    expect(saveState(quotaExceededStorage() as unknown as Storage, s)).toBe(false)
  })

  it("matchesStored is true only when the bytes are identical", () => {
    const s = initialState(TODAY)
    expect(matchesStored(window.localStorage, s)).toBe(false)
    saveState(window.localStorage, s)
    expect(matchesStored(window.localStorage, s)).toBe(true)
    expect(matchesStored(window.localStorage, { ...s, nextId: 10 })).toBe(false)
    expect(matchesStored(undefined, s)).toBe(false)
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
    // 23:30 CT on 7 Oct 2026 is already 8 Oct in UTC.
    mount(new Date("2026-10-08T04:30:00.000Z").getTime())
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

    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("today")).toHaveTextContent(TODAY)
    expect(writes.calls).toHaveLength(1)
    writes.restore()
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

  it("a storage event with the key removed (Reset elsewhere) re-seeds this tab and clears edited", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    const writes = countingSetItem()
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("names")).not.toHaveTextContent("Katy")
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

  it("a corrupt copy written by another tab is parked and this tab falls back to the seed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    act(() => fireStorageEvent(STORAGE_KEY, "{not json"))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("status")).toHaveTextContent("saved=false")
    expect(window.localStorage.getItem(clinicsStorage.rejectedKey)).toBe("{not json")
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
