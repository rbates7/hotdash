import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { type LoadResult, type RejectedCopy } from "@/lib/persistence"
import { buildSeed, seedState } from "@/lib/roadmap/fixture"
import { inColumn, parseState, type RoadmapState } from "@/lib/roadmap/roadmap"
import {
  REJECTED_KEY,
  RoadmapProvider,
  STORAGE_KEY,
  clearState,
  initialRoadmapShell,
  loadState,
  reducer,
  roadmapStorage,
  saveState,
  shellReducer,
  useRoadmap,
  type Edit,
} from "@/components/product-roadmap/roadmap-store"
import { LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
import { fireStorageEvent } from "@/test/storage"

/** The parked rejected copies, newest first. */
const rejected = (): RejectedCopy[] => JSON.parse(window.localStorage.getItem(REJECTED_KEY) ?? "[]")

const NOW = Date.parse("2026-10-07T15:00:00.000Z")
const AT = "2026-10-07T15:00:00.000Z"

const titlesIn = (state: RoadmapState, column: "now" | "next" | "later") =>
  inColumn(state.items, column).map((i) => i.title)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const empty: LoadResult<RoadmapState> = { state: null, status: "empty" }
const found = (state: RoadmapState): LoadResult<RoadmapState> => ({ state, status: "saved" })
const hydrated = (nowMs = NOW) => shellReducer(initialRoadmapShell(nowMs), { type: "hydrate", result: empty, nowMs })

describe("reducer", () => {
  it("adds a bet at the bottom of the chosen column, owned by Rashad by default, not sample data", () => {
    const state = reducer(seedState(NOW), {
      type: "add",
      input: { title: "  Practice plan templates ", why: " Reusable weekly plans. ", window: " Q1 2027 " },
      at: AT,
    })
    expect(state.items).toHaveLength(9)
    const added = state.items.at(-1)!
    expect(added).toMatchObject({
      id: "rm-9",
      title: "Practice plan templates",
      why: "Reusable weekly plans.",
      owner: "Rashad",
      window: "Q1 2027",
      column: "later",
      order: 2,
      linkedTickets: 0,
      signedAt: AT,
      updatedAt: AT,
    })
    expect(added.sample).toBeUndefined()
    expect(added.fromFeatureRequest).toBeUndefined()
    expect(state.nextId).toBe(10)
  })

  it("adds into Now when asked, after the existing cards, and refuses an empty title", () => {
    let state = reducer(seedState(NOW), { type: "add", input: { title: "Mine", owner: "Mace", column: "now" }, at: AT })
    expect(titlesIn(state, "now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Mine"])
    expect(state.items.at(-1)!.owner).toBe("Mace")
    const before = state
    state = reducer(state, { type: "add", input: { title: "   " }, at: AT })
    expect(state).toBe(before)
  })

  it("caps text at the input limits so a saved copy always validates", () => {
    const state = reducer(seedState(NOW), {
      type: "add",
      input: { title: "t".repeat(200), why: "w".repeat(200), window: "x".repeat(50) },
      at: AT,
    })
    const added = state.items.at(-1)!
    expect(added.title).toHaveLength(80)
    expect(added.why).toHaveLength(160)
    expect(added.window).toHaveLength(24)
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it("edits title, why, owner and window; rewriting the words drops the sample tag", () => {
    const state = reducer(seedState(NOW), {
      type: "patch",
      id: "rm-1",
      patch: { title: "Flag 2026", why: "Flag.", owner: "Mace", window: "Q1 2027" },
      at: AT,
    })
    const i = state.items.find((x) => x.id === "rm-1")!
    expect(i).toMatchObject({ title: "Flag 2026", why: "Flag.", owner: "Mace", window: "Q1 2027", updatedAt: AT })
    expect(i.sample).toBeUndefined()
  })

  it("rewriting rm-4's title drops the sample leftovers: no tag, 0 tickets, no source, signedAt = at", () => {
    const seed = seedState(NOW).items.find((x) => x.id === "rm-4")!
    expect(seed).toMatchObject({ sample: true, fromFeatureRequest: true, linkedTickets: 1 })
    expect(seed.signedAt).not.toBe(AT)
    const state = reducer(seedState(NOW), {
      type: "patch",
      id: "rm-4",
      patch: { title: "Import a play from a HUDL link" },
      at: AT,
    })
    const i = state.items.find((x) => x.id === "rm-4")!
    expect(i.sample).toBeUndefined()
    expect(i.fromFeatureRequest).toBeUndefined()
    expect(i.linkedTickets).toBe(0)
    expect(i.signedAt).toBe(AT)
    expect(i.title).toBe("Import a play from a HUDL link")
  })

  it("re-owning a bet keeps the sample tag; it is still our words", () => {
    const state = reducer(seedState(NOW), { type: "patch", id: "rm-1", patch: { owner: "Mace" }, at: AT })
    const i = state.items.find((x) => x.id === "rm-1")!
    expect(i.owner).toBe("Mace")
    expect(i.sample).toBe(true)
    expect(i.updatedAt).toBe(AT)
  })

  it("a no-op patch returns the same state and does not bump updatedAt", () => {
    const before = seedState(NOW)
    const seed = before.items[0]
    const same = reducer(before, {
      type: "patch",
      id: "rm-1",
      patch: { title: ` ${seed.title} `, why: seed.why, owner: seed.owner, window: seed.window },
      at: AT,
    })
    expect(same).toBe(before)
    expect(same.items[0].updatedAt).toBe(seed.updatedAt)
    expect(reducer(before, { type: "patch", id: "rm-1", patch: {}, at: AT })).toBe(before)
    expect(reducer(before, { type: "patch", id: "rm-99", patch: { title: "x" }, at: AT })).toBe(before)
  })

  it("never blanks a title through a patch", () => {
    const state = reducer(seedState(NOW), { type: "patch", id: "rm-1", patch: { title: "  " }, at: AT })
    expect(state.items[0].title).toBe("Flag Football 2026")
  })

  it("moves a bet to the bottom of another column and closes the gap it left", () => {
    const state = reducer(seedState(NOW), { type: "move", id: "rm-1", column: "next", at: AT })
    expect(titlesIn(state, "now")).toEqual(["Play share links", "iPad forced updates"])
    expect(inColumn(state.items, "now").map((i) => i.order)).toEqual([0, 1])
    expect(titlesIn(state, "next")).toEqual(["Web import from a link", "Staff seats", "CSV web import", "Flag Football 2026"])
    const moved = state.items.find((i) => i.id === "rm-1")!
    expect(moved).toMatchObject({ column: "next", order: 3, updatedAt: AT, sample: true })
  })

  it("moving to the column it is already in is a no-op", () => {
    const before = seedState(NOW)
    expect(reducer(before, { type: "move", id: "rm-1", column: "now", at: AT })).toBe(before)
    expect(reducer(before, { type: "move", id: "rm-99", column: "later", at: AT })).toBe(before)
  })

  it("reorders within a column with up/down and stops at the edges", () => {
    let state = reducer(seedState(NOW), { type: "reorder", id: "rm-2", direction: -1, at: AT })
    expect(titlesIn(state, "now")).toEqual(["Play share links", "Flag Football 2026", "iPad forced updates"])
    expect(inColumn(state.items, "now").map((i) => i.order)).toEqual([0, 1, 2])
    expect(state.items.find((i) => i.id === "rm-2")!.updatedAt).toBe(AT)
    // The swapped neighbour moved, but it was not edited.
    expect(state.items.find((i) => i.id === "rm-1")!.updatedAt).not.toBe(AT)

    const atTop = state
    state = reducer(state, { type: "reorder", id: "rm-2", direction: -1, at: "later" })
    expect(state).toBe(atTop)
    state = reducer(state, { type: "reorder", id: "rm-3", direction: 1, at: "later" })
    expect(state).toBe(atTop)

    state = reducer(state, { type: "reorder", id: "rm-1", direction: 1, at: AT })
    expect(titlesIn(state, "now")).toEqual(["Play share links", "iPad forced updates", "Flag Football 2026"])
    // Other columns untouched.
    expect(titlesIn(state, "next")).toEqual(titlesIn(seedState(NOW), "next"))
  })

  it("removes a bet and renumbers its column", () => {
    const state = reducer(seedState(NOW), { type: "remove", id: "rm-5" })
    expect(state.items).toHaveLength(7)
    expect(titlesIn(state, "next")).toEqual(["Web import from a link", "CSV web import"])
    expect(inColumn(state.items, "next").map((i) => i.order)).toEqual([0, 1])
    const before = state
    expect(reducer(state, { type: "remove", id: "rm-5" })).toBe(before)
  })
})

describe("shell (through the shared persistence shell)", () => {
  const edit: Edit = { type: "add", input: { title: "Mine" }, at: AT }

  it("starts unhydrated, unsaved and never-edited, seeded from and holding the request clock", () => {
    const shell = initialRoadmapShell(NOW)
    expect(shell).toMatchObject({ persisted: false, saved: false, edited: false, saveFailed: false, edits: 0, savedEdits: 0, nowMs: NOW })
    expect(shell.data).toEqual(seedState(NOW))
  })

  it("the first hydrate applies a saved copy (saved, not edited, clock unmoved) or seeds lazily from the request clock", () => {
    const saved: RoadmapState = { items: [], nextId: 1 }
    const withCopy = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: found(saved), nowMs: NOW })
    expect(withCopy).toMatchObject({ data: saved, persisted: true, saved: true, edited: false, nowMs: NOW })
    const none = hydrated(NOW)
    expect(none).toMatchObject({ persisted: true, saved: false, edited: false, nowMs: NOW })
    expect(none.data).toEqual(seedState(NOW))
  })

  it("the storage parses with the validator, so unknown keys never reach the board", () => {
    const saved = seedState(NOW)
    const withExtras = { ...saved, version: 1, items: saved.items.map((i) => ({ ...i, extra: true })) }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withExtras))
    expect(loadState(window.localStorage)).toEqual({ state: saved, status: "saved" })
  })

  it("a real edit marks edited and bumps the edit count; saved waits for the write; a no-op edit returns the same shell", () => {
    const shell = hydrated()
    const edited = shellReducer(shell, edit)
    expect(edited).toMatchObject({ edited: true, edits: 1, saved: false })
    expect(shellReducer(edited, { type: "save-result", ok: true })).toMatchObject({ saved: true, saveFailed: false, savedEdits: 1 })
    expect(shellReducer(edited, { type: "save-result", ok: false })).toMatchObject({ saved: false, saveFailed: true, savedEdits: 0 })
    expect(shellReducer(shell, { type: "add", input: { title: " " }, at: AT })).toBe(shell)
    expect(shellReducer(shell, { type: "move", id: "rm-1", column: "now", at: AT })).toBe(shell)
    expect(shellReducer(shell, { type: "reorder", id: "rm-1", direction: -1, at: AT })).toBe(shell)
    expect(shellReducer(shell, { type: "patch", id: "rm-1", patch: { owner: "Rashad" }, at: AT })).toBe(shell)
    expect(shellReducer(shell, { type: "remove", id: "nope" })).toBe(shell)
  })

  it("a hydrate after a *saved* edit is not an edit: another tab's copy is theirs, clock unmoved", () => {
    let shell = shellReducer(hydrated(), edit)
    shell = shellReducer(shell, { type: "save-result", ok: true })
    const theirs: RoadmapState = { items: [], nextId: 1 }
    const later = LATE_EVENING_CT_MS
    shell = shellReducer(shell, { type: "hydrate", result: found(theirs), nowMs: later })
    expect(shell).toMatchObject({ data: theirs, edited: false, saved: true, edits: 1, nowMs: NOW })
  })

  it("a local edit that has not been saved yet wins over an incoming copy", () => {
    const shell = shellReducer(hydrated(), edit)
    const theirs: RoadmapState = { items: [], nextId: 1 }
    const after = shellReducer(shell, { type: "hydrate", result: found(theirs), nowMs: NOW })
    expect(after.data).toBe(shell.data)
    // Round 5: keep `saved` / `saveFailed` as they are — an incoming copy
    // must not read as "Saved" over unsaved edits.
    expect(after).toMatchObject({ edited: true, saved: false, saveFailed: false })
    expect(after).toBe(shell)
  })

  it("a failed save is never masked by an incoming copy", () => {
    let shell = shellReducer(hydrated(), edit)
    shell = shellReducer(shell, { type: "save-result", ok: false })
    const theirs: RoadmapState = { items: [], nextId: 1 }
    const after = shellReducer(shell, { type: "hydrate", result: found(theirs), nowMs: NOW })
    expect(after.data).toBe(shell.data)
    expect(after).toMatchObject({ edited: true, saved: false, saveFailed: true })
    expect(after).toBe(shell)
  })

  it("another tab's Reset (no copy) re-seeds this tab from the instant it is handed, never-edited", () => {
    let shell = shellReducer(hydrated(), edit)
    shell = shellReducer(shell, { type: "save-result", ok: true })
    shell = shellReducer(shell, { type: "hydrate", result: empty, nowMs: LATE_EVENING_CT_MS })
    expect(shell).toMatchObject({ edited: false, saved: false, nowMs: LATE_EVENING_CT_MS })
    expect(shell.data).toEqual(seedState(LATE_EVENING_CT_MS))
  })

  it("reset rebuilds the seed from the instant it is handed and moves the clock", () => {
    let shell = shellReducer(hydrated(), { type: "remove", id: "rm-1" })
    shell = shellReducer(shell, edit)
    shell = shellReducer(shell, { type: "save-result", ok: false })
    const later = Date.parse("2027-03-01T15:00:00.000Z")
    const reset = shellReducer(shell, { type: "reset", nowMs: later })
    expect(reset).toMatchObject({ persisted: true, saved: false, edited: false, saveFailed: false, nowMs: later, edits: shell.edits, savedEdits: shell.edits })
    expect(reset.data).toEqual(seedState(later))
    expect(reset.data.items[0].window).toBe("Q1 2027")
  })
})

describe("storage (shared createStorage, roadmap key)", () => {
  it("uses the agreed keys", () => {
    expect(STORAGE_KEY).toBe("hotdash.product-roadmap.v1")
    expect(REJECTED_KEY).toBe("hotdash.product-roadmap.v1.rejected")
    expect(roadmapStorage.key).toBe(STORAGE_KEY)
    expect(roadmapStorage.rejectedKey).toBe(REJECTED_KEY)
  })

  it("round-trips a state and reports success", () => {
    const state = reducer(seedState(NOW), { type: "add", input: { title: "Round trip" }, at: AT })
    expect(saveState(window.localStorage, state)).toBe(true)
    expect(loadState(window.localStorage)).toEqual({ state, status: "saved" })
  })

  it("reports failure instead of throwing when the write is refused", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    expect(saveState(window.localStorage, seedState(NOW))).toBe(false)
    expect(saveState(undefined, seedState(NOW))).toBe(false)
  })

  it("load() is pure: a copy with one bad item is refused and left in place; the first save parks it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const good = seedState(NOW)
    const bad = { ...good, items: good.items.map((i, n) => (n === 2 ? { ...i, owner: "Dan" } : i)) }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    const result = loadState(window.localStorage)
    expect(result).toMatchObject({ state: null, status: "rejected", rejected: { raw, why: "failed validation" } })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(rejected()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)

    expect(saveState(window.localStorage, good)).toBe(true)
    expect(rejected()).toHaveLength(1)
    expect(rejected()[0]).toMatchObject({ raw, why: "failed validation" })
    expect(loadState(window.localStorage)).toEqual({ state: good, status: "saved" })
  })

  it("rejects garbage too", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage)).toMatchObject({ status: "rejected", rejected: { raw: "{not json", why: "is not JSON" } })
  })

  it("does not re-write an identical copy", () => {
    const state = seedState(NOW)
    expect(saveState(window.localStorage, state)).toBe(true)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(saveState(window.localStorage, state)).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
  })

  it("clearState removes only our key", () => {
    window.localStorage.setItem(STORAGE_KEY, "x")
    window.localStorage.setItem(REJECTED_KEY, "y")
    window.localStorage.setItem("other", "z")
    clearState(window.localStorage)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe("y")
    expect(window.localStorage.getItem("other")).toBe("z")
  })
})

/* --------------------------------------------------------------- provider */

function Probe() {
  const { items, nowMs, persisted, edited, saved, saveFailed, addItem, patchItem, moveItem, reorderItem, removeItem, resetDemoData } =
    useRoadmap()
  const now = inColumn(items, "now")
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="edited">{String(edited)}</span>
      <span data-testid="saved">{String(saved)}</span>
      <span data-testid="save-failed">{String(saveFailed)}</span>
      <span data-testid="now-ms">{nowMs}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="now-titles">{now.map((i) => i.title).join("|")}</span>
      <span data-testid="rm-1-window">{items.find((i) => i.id === "rm-1")?.window ?? ""}</span>
      <span data-testid="rm-1-updated">{items.find((i) => i.id === "rm-1")?.updatedAt ?? ""}</span>
      <button type="button" onClick={() => addItem({ title: "Probe bet", column: "now" })}>add</button>
      <button type="button" onClick={() => addItem({ title: "   " })}>add-nothing</button>
      <button type="button" onClick={() => moveItem("rm-1", "now")}>same-column</button>
      <button type="button" onClick={() => reorderItem("rm-1", -1)}>already-top</button>
      <button type="button" onClick={() => patchItem("rm-1", { owner: "Rashad" })}>same-owner</button>
      <button type="button" onClick={() => moveItem("rm-1", "later")}>move-later</button>
      <button type="button" onClick={() => reorderItem("rm-3", -1)}>up-3</button>
      <button type="button" onClick={() => removeItem("rm-8")}>remove-8</button>
      <button type="button" onClick={resetDemoData}>reset</button>
    </div>
  )
}

function mount(nowMs = NOW) {
  return render(
    <RoadmapProvider nowMs={nowMs}>
      <Probe />
    </RoadmapProvider>
  )
}

const click = (name: string) => act(() => screen.getByRole("button", { name }).click())
const writesTo = (spy: { mock: { calls: unknown[][] } }, key: string) =>
  spy.mock.calls.filter((c) => c[0] === key).length
const text = (id: string) => screen.getByTestId(id).textContent

describe("RoadmapProvider", () => {
  it("hydrates before the first paint and measures from the request clock it was given", () => {
    mount()
    // Synchronous: the layout effect ran inside render(), no await needed.
    expect(text("persisted")).toBe("true")
    expect(text("count")).toBe("8")
    expect(text("now-ms")).toBe(String(NOW))
  })

  it("writes nothing on mount, and no-op edits do not count", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(text("saved")).toBe("false")
    expect(text("edited")).toBe("false")
    expect(setItem).not.toHaveBeenCalled()
    const updatedBefore = text("rm-1-updated")

    click("add-nothing")
    click("same-column")
    click("already-top")
    click("same-owner")
    expect(text("saved")).toBe("false")
    expect(text("edited")).toBe("false")
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(text("rm-1-updated")).toBe(updatedBefore)
  })

  it("does not re-write a copy it merely found on load", () => {
    const state = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(text("saved")).toBe("true")
    expect(text("edited")).toBe("false")
    expect(text("count")).toBe("9")
    expect(setItem).not.toHaveBeenCalled()
  })

  it("seeds from the request clock it is handed, never from Date.now()", () => {
    const spy = vi.spyOn(Date, "now")
    const first = mount()
    expect(text("rm-1-window")).toBe("Q4 2026")
    first.unmount()
    mount(Date.parse("2027-03-01T15:00:00.000Z"))
    expect(text("rm-1-window")).toBe("Q1 2027")
    expect(spy).not.toHaveBeenCalled()
  })

  it("persists from the first real edit on, once per change, and rehydrates after a remount (reload)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const first = mount()
    click("add")
    expect(text("saved")).toBe("true")
    expect(text("edited")).toBe("true")
    expect(text("save-failed")).toBe("false")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(1)
    click("move-later")
    click("up-3")
    click("remove-8")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(4)
    expect(text("count")).toBe("8")
    expect(text("now-titles")).toBe("iPad forced updates|Play share links|Probe bet")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"title":"Probe bet"')

    first.unmount()
    mount()
    expect(text("persisted")).toBe("true")
    expect(text("saved")).toBe("true")
    expect(text("count")).toBe("8")
    expect(text("now-titles")).toBe("iPad forced updates|Play share links|Probe bet")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(4) // the remount wrote nothing
  })

  it("stamps edits with the shared clock at the moment of the edit, not the request's instant", () => {
    const EDIT_AT = new Date("2026-10-07T21:45:00.000Z")
    vi.useFakeTimers({ now: EDIT_AT, toFake: ["Date"] })
    mount(NOW)
    click("move-later")
    expect(text("rm-1-updated")).toBe(EDIT_AT.toISOString())
    expect(text("now-ms")).toBe(String(NOW)) // the clock the screen measures from is unmoved by an edit
  })

  it("Reset throws the browser's copy away and re-seeds from now(), moving the clock", () => {
    mount(NOW)
    click("add")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    // Opened in the evening; Reset the next afternoon.
    const nextDay = new Date("2027-03-01T20:00:00.000Z")
    vi.useFakeTimers({ now: nextDay, toFake: ["Date"] })
    click("reset")
    expect(text("count")).toBe("8")
    expect(text("now-titles")).toBe("Flag Football 2026|Play share links|iPad forced updates")
    expect(text("saved")).toBe("false")
    expect(text("edited")).toBe("false")
    expect(text("now-ms")).toBe(String(nextDay.getTime()))
    expect(text("rm-1-window")).toBe("Q1 2027") // the seed is dated from the Reset, not the request
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("reports a failed write and recovers when the next one lands", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    mount()
    click("add")
    // Nothing landed, so the note must not claim "Saved" (and Reset stays off).
    expect(text("saved")).toBe("false")
    expect(text("save-failed")).toBe("true")
    expect(text("count")).toBe("9") // the edit still works for the session
    setItem.mockRestore()
    click("move-later")
    expect(text("saved")).toBe("true")
    expect(text("save-failed")).toBe("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
  })

  it("falls back to the seed when the saved copy has one bad item; the copy is parked on the first save", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bad = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT })
    bad.items[3] = { ...bad.items[3], column: "shipped" as never }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    mount()
    expect(text("persisted")).toBe("true")
    expect(text("saved")).toBe("false")
    expect(text("count")).toBe("8")
    // load() is pure: the bad copy stays put, nothing parked yet.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(rejected()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    // The first real edit parks it and writes the real board.
    click("add")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("shipped")
    expect(rejected()[0]).toMatchObject({ raw, why: "failed validation" })
  })

  it("follows a change made in another tab without writing anything back, clock unmoved", () => {
    mount()
    click("add") // this tab has saved edits of its own
    const other = reducer(seedState(NOW), { type: "add", input: { title: "From another tab", column: "now" }, at: AT })
    const raw = JSON.stringify(other)
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    act(() => fireStorageEvent(STORAGE_KEY, raw))
    expect(text("count")).toBe("9")
    expect(text("saved")).toBe("true")
    expect(text("edited")).toBe("false")
    expect(text("now-titles")).toBe("Flag Football 2026|Play share links|iPad forced updates|From another tab")
    expect(text("now-ms")).toBe(String(NOW))
    // Following is not editing: nothing written back, so two tabs never ping-pong.
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })

  it("another tab's Reset re-seeds this tab from now(), never-edited, and still writes nothing", () => {
    mount(NOW)
    click("add")
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    vi.useFakeTimers({ now: LATE_EVENING_CT, toFake: ["Date"] })
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(text("count")).toBe("8")
    expect(text("saved")).toBe("false")
    expect(text("edited")).toBe("false")
    expect(text("now-ms")).toBe(String(LATE_EVENING_CT_MS))
    expect(setItem).not.toHaveBeenCalled()
    // Storage.clear() in the other tab arrives with a null key.
    click("add")
    window.localStorage.clear()
    act(() => fireStorageEvent(null, null))
    expect(text("count")).toBe("8")
    expect(text("edited")).toBe("false")
  })

  it("after taking another tab's copy, the next real edit writes exactly once", () => {
    mount()
    const other = reducer(seedState(NOW), { type: "add", input: { title: "From another tab", column: "now" }, at: AT })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(other))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(other)))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    click("move-later")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("From another tab")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"column":"later"')
  })

  it("ignores storage events for other keys and other storage areas", () => {
    mount()
    click("add")
    const other = JSON.stringify({ items: [], nextId: 1 })
    act(() => {
      fireStorageEvent("hotdash.feature-requests.v1", other)
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: other, storageArea: window.sessionStorage }))
    })
    expect(text("count")).toBe("9")
  })

  it("a bad copy arriving from another tab is refused: seed shown, copy left for the next save to park", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    click("add")
    window.localStorage.setItem(STORAGE_KEY, "{broken")
    act(() => fireStorageEvent(STORAGE_KEY, "{broken"))
    expect(text("count")).toBe("8")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{broken")
    expect(rejected()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    click("add")
    expect(rejected()[0]).toMatchObject({ raw: "{broken", why: "is not JSON" })
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
  })

  it("the seed it falls back to matches the fixture exactly", () => {
    mount()
    expect(text("count")).toBe(String(buildSeed(NOW).length))
  })
})
