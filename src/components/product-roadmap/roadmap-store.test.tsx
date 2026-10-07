import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { type RejectedCopy } from "@/lib/persistence"
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
import { fireStorageEvent } from "@/test/storage"

/** The parked rejected copies, newest first. */
const rejected = (): RejectedCopy[] => JSON.parse(window.localStorage.getItem(REJECTED_KEY) ?? "[]")

const NOW = Date.parse("2026-10-07T15:00:00.000Z")
const AT = "2026-10-07T15:00:00.000Z"

const titlesIn = (state: RoadmapState, column: "now" | "next" | "later") =>
  inColumn(state.items, column).map((i) => i.title)

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it("starts unhydrated, unsaved and never-edited, seeded from nowMs", () => {
    expect(initialRoadmapShell(NOW)).toMatchObject({ persisted: false, saved: false, edited: false, saveFailed: false, edits: 0 })
    expect(initialRoadmapShell(NOW).data).toEqual(seedState(NOW))
  })

  it("hydrate applies a saved copy (saved, not edited) or rebuilds the seed from nowMs", () => {
    const saved: RoadmapState = { items: [], nextId: 1 }
    const found = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: { state: saved, status: "saved" } }, NOW)
    expect(found).toMatchObject({ data: saved, persisted: true, saved: true, edited: false })
    const later = Date.parse("2027-03-01T15:00:00.000Z")
    const none = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: { state: null, status: "empty" } }, later)
    expect(none).toMatchObject({ persisted: true, saved: false, edited: false })
    expect(none.data).toEqual(seedState(later))
  })

  it("the storage parses with the validator, so unknown keys never reach the board", () => {
    const saved = seedState(NOW)
    const withExtras = { ...saved, version: 1, items: saved.items.map((i) => ({ ...i, extra: true })) }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(withExtras))
    expect(loadState(window.localStorage)).toEqual({ state: saved, status: "saved" })
  })

  it("a real edit marks edited and bumps the edit count; saved waits for the write; a no-op edit returns the same shell", () => {
    const shell = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: { state: null, status: "empty" } }, NOW)
    const edited = shellReducer(shell, edit, NOW)
    expect(edited).toMatchObject({ edited: true, edits: 1, saved: false })
    expect(shellReducer(edited, { type: "save-result", ok: true }, NOW)).toMatchObject({ saved: true, saveFailed: false })
    expect(shellReducer(edited, { type: "save-result", ok: false }, NOW)).toMatchObject({ saved: false, saveFailed: true })
    expect(shellReducer(shell, { type: "add", input: { title: " " }, at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "move", id: "rm-1", column: "now", at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "reorder", id: "rm-1", direction: -1, at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "patch", id: "rm-1", patch: { owner: "Rashad" }, at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "remove", id: "nope" }, NOW)).toBe(shell)
  })

  it("a hydrate after edits is not an edit: another tab's copy is theirs", () => {
    let shell = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: { state: null, status: "empty" } }, NOW)
    shell = shellReducer(shell, edit, NOW)
    const theirs: RoadmapState = { items: [], nextId: 1 }
    const editsBefore = shell.edits
    shell = shellReducer(shell, { type: "hydrate", result: { state: theirs, status: "saved" } }, NOW)
    expect(shell).toMatchObject({ data: theirs, edited: false, saved: true, edits: editsBefore })
    // …and a removal elsewhere re-seeds this tab, never-edited.
    shell = shellReducer(shell, { type: "hydrate", result: { state: null, status: "empty" } }, NOW)
    expect(shell).toMatchObject({ edited: false, saved: false })
    expect(shell.data).toEqual(seedState(NOW))
  })

  it("reset rebuilds the seed against the request clock, not a client read, and clears the flags", () => {
    const spy = vi.spyOn(Date, "now")
    let shell = shellReducer(initialRoadmapShell(NOW), { type: "hydrate", result: { state: null, status: "empty" } }, NOW)
    shell = shellReducer(shell, { type: "remove", id: "rm-1" }, NOW)
    shell = shellReducer(shell, edit, NOW)
    shell = shellReducer(shell, { type: "save-result", ok: false }, NOW)
    const later = Date.parse("2027-03-01T15:00:00.000Z")
    const reset = shellReducer(shell, { type: "reset" }, later)
    expect(reset).toMatchObject({ persisted: true, saved: false, edited: false, saveFailed: false, edits: shell.edits })
    expect(reset.data).toEqual(seedState(later))
    expect(reset.data.items[0].window).toBe("Q1 2027")
    expect(spy).not.toHaveBeenCalled()
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

  it("rejects the whole copy when one item is bad: parks it raw under .rejected and drops the live key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const good = seedState(NOW)
    const bad = { ...good, items: good.items.map((i, n) => (n === 2 ? { ...i, owner: "Dan" } : i)) }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toEqual({ state: null, status: "rejected" })
    expect(rejected()).toHaveLength(1)
    expect(rejected()[0]).toMatchObject({ raw, why: "failed validation" })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("rejects garbage too, newest first", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage).status).toBe("rejected")
    expect(rejected()[0]).toMatchObject({ raw: "{not json", why: "is not JSON" })
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

describe("RoadmapProvider", () => {
  it("hydrates before the first paint and exposes the request clock it was given", () => {
    mount()
    // Synchronous: the layout effect ran inside render(), no await needed.
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-ms")).toHaveTextContent(String(NOW))
  })

  it("writes nothing on mount, and no-op edits do not count", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(setItem).not.toHaveBeenCalled()
    const updatedBefore = screen.getByTestId("rm-1-updated").textContent

    click("add-nothing")
    click("same-column")
    click("already-top")
    click("same-owner")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("rm-1-updated")).toHaveTextContent(updatedBefore!)
  })

  it("does not re-write a copy it merely found on load", () => {
    const state = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(setItem).not.toHaveBeenCalled()
  })

  it("seeds from the clock it is handed, never from Date.now()", () => {
    const spy = vi.spyOn(Date, "now")
    const first = mount()
    expect(screen.getByTestId("rm-1-window")).toHaveTextContent("Q4 2026")
    first.unmount()
    mount(Date.parse("2027-03-01T15:00:00.000Z"))
    expect(screen.getByTestId("rm-1-window")).toHaveTextContent("Q1 2027")
    expect(spy).not.toHaveBeenCalled()
  })

  it("persists from the first real edit on, once per change, and rehydrates after a remount (reload)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const first = mount()
    click("add")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("edited")).toHaveTextContent("true")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("false")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(1)
    click("move-later")
    click("up-3")
    click("remove-8")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(4)
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("iPad forced updates|Play share links|Probe bet")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"title":"Probe bet"')

    first.unmount()
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("iPad forced updates|Play share links|Probe bet")
    expect(writesTo(setItem, STORAGE_KEY)).toBe(4) // the remount wrote nothing
  })

  it("stamps edits with the request clock, not a client read", () => {
    // NOW is in 2026; a client read would stamp the real wall clock instead.
    // (Date.now can't be spied on here: jsdom stamps every DOM event with it.)
    mount()
    click("move-later")
    expect(screen.getByTestId("rm-1-updated")).toHaveTextContent(AT)
  })

  it("Reset throws the browser's copy away entirely and shows a fresh seed", () => {
    mount()
    click("add")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    click("reset")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("Flag Football 2026|Play share links|iPad forced updates")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
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
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("9") // the edit still works for the session
    setItem.mockRestore()
    click("move-later")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
  })

  it("falls back to the seed when the saved copy has one bad item; the copy is parked under .rejected", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bad = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT })
    bad.items[3] = { ...bad.items[3], column: "shipped" as never }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(rejected()[0].raw).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    // Nothing is written until the founder edits again; the parked copy stays.
    click("add")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("shipped")
    expect(rejected()[0].raw).toBe(raw)
  })

  it("follows a change made in another tab without writing anything back", () => {
    mount()
    click("add") // this tab has edits of its own
    const other = reducer(seedState(NOW), { type: "add", input: { title: "From another tab", column: "now" }, at: AT })
    const raw = JSON.stringify(other)
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    act(() => fireStorageEvent(STORAGE_KEY, raw))
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("From another tab")
    // Following is not editing: nothing written back, so two tabs never ping-pong.
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })

  it("a removal in another tab re-seeds this tab, never-edited, and still writes nothing", () => {
    mount()
    click("add")
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(setItem).not.toHaveBeenCalled()
    // Storage.clear() in the other tab arrives with a null key.
    click("add")
    window.localStorage.clear()
    act(() => fireStorageEvent(null, null))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
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
    expect(screen.getByTestId("count")).toHaveTextContent("9")
  })

  it("quarantines a bad copy arriving from another tab and falls back to the seed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    click("add")
    window.localStorage.setItem(STORAGE_KEY, "{broken")
    act(() => fireStorageEvent(STORAGE_KEY, "{broken"))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(rejected()[0].raw).toBe("{broken")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("the seed it falls back to matches the fixture exactly", () => {
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent(String(buildSeed(NOW).length))
  })
})
