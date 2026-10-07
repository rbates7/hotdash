import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { buildSeed, seedState } from "@/lib/roadmap/fixture"
import { inColumn, type RoadmapState } from "@/lib/roadmap/roadmap"
import {
  REJECTED_KEY,
  RoadmapProvider,
  STORAGE_KEY,
  clearState,
  initialShell,
  loadState,
  parseRaw,
  quarantineRejected,
  reducer,
  saveState,
  shellReducer,
  useRoadmap,
  type Action,
} from "@/components/product-roadmap/roadmap-store"

const NOW = Date.parse("2026-10-07T15:00:00.000Z")
const AT = "2026-10-07T15:00:00.000Z"

const titlesIn = (state: RoadmapState, column: "now" | "next" | "later") =>
  inColumn(state.items, column).map((i) => i.title)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("reducer", () => {
  it("adds a bet at the bottom of the chosen column, owned by Rashad by default, not sample data", () => {
    const state = reducer(
      seedState(NOW),
      { type: "add", input: { title: "  Practice plan templates ", why: " Reusable weekly plans. ", window: " Q1 2027 " }, at: AT },
      NOW
    )
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
    let state = reducer(seedState(NOW), { type: "add", input: { title: "Mine", owner: "Mace", column: "now" }, at: AT }, NOW)
    expect(titlesIn(state, "now")).toEqual(["Flag Football 2026", "Play share links", "iPad forced updates", "Mine"])
    expect(state.items.at(-1)!.owner).toBe("Mace")
    const before = state
    state = reducer(state, { type: "add", input: { title: "   " }, at: AT }, NOW)
    expect(state).toBe(before)
  })

  it("caps text at the input limits so a saved copy always validates", () => {
    const state = reducer(
      seedState(NOW),
      { type: "add", input: { title: "t".repeat(200), why: "w".repeat(200), window: "x".repeat(50) }, at: AT },
      NOW
    )
    const added = state.items.at(-1)!
    expect(added.title).toHaveLength(80)
    expect(added.why).toHaveLength(160)
    expect(added.window).toHaveLength(24)
  })

  it("edits title, why, owner and window; rewriting the words drops the sample tag", () => {
    const state = reducer(
      seedState(NOW),
      { type: "patch", id: "rm-1", patch: { title: "Flag 2026", why: "Flag.", owner: "Mace", window: "Q1 2027" }, at: AT },
      NOW
    )
    const i = state.items.find((x) => x.id === "rm-1")!
    expect(i).toMatchObject({ title: "Flag 2026", why: "Flag.", owner: "Mace", window: "Q1 2027", updatedAt: AT })
    expect(i.sample).toBeUndefined()
  })

  it("re-owning a bet keeps the sample tag; it is still our words", () => {
    const state = reducer(seedState(NOW), { type: "patch", id: "rm-1", patch: { owner: "Mace" }, at: AT }, NOW)
    const i = state.items.find((x) => x.id === "rm-1")!
    expect(i.owner).toBe("Mace")
    expect(i.sample).toBe(true)
    expect(i.updatedAt).toBe(AT)
  })

  it("a no-op patch returns the same state and does not bump updatedAt", () => {
    const before = seedState(NOW)
    const seed = before.items[0]
    const same = reducer(
      before,
      { type: "patch", id: "rm-1", patch: { title: ` ${seed.title} `, why: seed.why, owner: seed.owner, window: seed.window }, at: AT },
      NOW
    )
    expect(same).toBe(before)
    expect(same.items[0].updatedAt).toBe(seed.updatedAt)
    expect(reducer(before, { type: "patch", id: "rm-1", patch: {}, at: AT }, NOW)).toBe(before)
    expect(reducer(before, { type: "patch", id: "rm-99", patch: { title: "x" }, at: AT }, NOW)).toBe(before)
  })

  it("never blanks a title through a patch", () => {
    const state = reducer(seedState(NOW), { type: "patch", id: "rm-1", patch: { title: "  " }, at: AT }, NOW)
    expect(state.items[0].title).toBe("Flag Football 2026")
  })

  it("moves a bet to the bottom of another column and closes the gap it left", () => {
    const state = reducer(seedState(NOW), { type: "move", id: "rm-1", column: "next", at: AT }, NOW)
    expect(titlesIn(state, "now")).toEqual(["Play share links", "iPad forced updates"])
    expect(inColumn(state.items, "now").map((i) => i.order)).toEqual([0, 1])
    expect(titlesIn(state, "next")).toEqual(["Web import from a link", "Staff seats", "CSV web import", "Flag Football 2026"])
    const moved = state.items.find((i) => i.id === "rm-1")!
    expect(moved).toMatchObject({ column: "next", order: 3, updatedAt: AT, sample: true })
  })

  it("moving to the column it is already in is a no-op", () => {
    const before = seedState(NOW)
    expect(reducer(before, { type: "move", id: "rm-1", column: "now", at: AT }, NOW)).toBe(before)
    expect(reducer(before, { type: "move", id: "rm-99", column: "later", at: AT }, NOW)).toBe(before)
  })

  it("reorders within a column with up/down and stops at the edges", () => {
    let state = reducer(seedState(NOW), { type: "reorder", id: "rm-2", direction: -1, at: AT }, NOW)
    expect(titlesIn(state, "now")).toEqual(["Play share links", "Flag Football 2026", "iPad forced updates"])
    expect(inColumn(state.items, "now").map((i) => i.order)).toEqual([0, 1, 2])
    expect(state.items.find((i) => i.id === "rm-2")!.updatedAt).toBe(AT)
    // The swapped neighbour moved, but it was not edited.
    expect(state.items.find((i) => i.id === "rm-1")!.updatedAt).not.toBe(AT)

    const atTop = state
    state = reducer(state, { type: "reorder", id: "rm-2", direction: -1, at: "later" }, NOW)
    expect(state).toBe(atTop)
    state = reducer(state, { type: "reorder", id: "rm-3", direction: 1, at: "later" }, NOW)
    expect(state).toBe(atTop)

    state = reducer(state, { type: "reorder", id: "rm-1", direction: 1, at: AT }, NOW)
    expect(titlesIn(state, "now")).toEqual(["Play share links", "iPad forced updates", "Flag Football 2026"])
    // Other columns untouched.
    expect(titlesIn(state, "next")).toEqual(titlesIn(seedState(NOW), "next"))
  })

  it("removes a bet and renumbers its column", () => {
    const state = reducer(seedState(NOW), { type: "remove", id: "rm-5" }, NOW)
    expect(state.items).toHaveLength(7)
    expect(titlesIn(state, "next")).toEqual(["Web import from a link", "CSV web import"])
    expect(inColumn(state.items, "next").map((i) => i.order)).toEqual([0, 1])
    const before = state
    expect(reducer(state, { type: "remove", id: "rm-5" }, NOW)).toBe(before)
  })

  it("hydrate applies a saved copy, or rebuilds the seed from nowMs when there is none", () => {
    const saved: RoadmapState = { items: [], nextId: 1 }
    expect(reducer(seedState(NOW), { type: "hydrate", state: saved }, NOW)).toBe(saved)
    const later = Date.parse("2027-03-01T15:00:00.000Z")
    expect(reducer(saved, { type: "hydrate", state: null }, later)).toEqual(seedState(later))
  })

  it("reset rebuilds the seed against the request clock, not a client read", () => {
    const spy = vi.spyOn(Date, "now")
    let state = reducer(seedState(NOW), { type: "remove", id: "rm-1" }, NOW)
    state = reducer(state, { type: "add", input: { title: "Mine" }, at: AT }, NOW)
    const later = Date.parse("2027-03-01T15:00:00.000Z")
    state = reducer(state, { type: "reset" }, later)
    expect(state).toEqual(seedState(later))
    expect(state.items[0].window).toBe("Q1 2027")
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("shell", () => {
  const edit: Action = { type: "add", input: { title: "Mine" }, at: AT }

  it("starts unhydrated, unsaved and clean", () => {
    expect(initialShell(NOW)).toMatchObject({ hydrated: false, saved: false, dirty: false, saveFailed: false })
    expect(initialShell(NOW).data).toEqual(seedState(NOW))
  })

  it("hydrate marks saved only when a copy was found, and is never dirty", () => {
    const found = shellReducer(initialShell(NOW), { type: "hydrate", state: { items: [], nextId: 1 } }, NOW)
    expect(found).toMatchObject({ hydrated: true, saved: true, dirty: false })
    const none = shellReducer(initialShell(NOW), { type: "hydrate", state: null }, NOW)
    expect(none).toMatchObject({ hydrated: true, saved: false, dirty: false })
  })

  it("a real edit marks saved + dirty; a no-op edit returns the same shell", () => {
    const shell = shellReducer(initialShell(NOW), { type: "hydrate", state: null }, NOW)
    const edited = shellReducer(shell, edit, NOW)
    expect(edited).toMatchObject({ saved: true, dirty: true })
    expect(shellReducer(shell, { type: "add", input: { title: " " }, at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "move", id: "rm-1", column: "now", at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "reorder", id: "rm-1", direction: -1, at: AT }, NOW)).toBe(shell)
    expect(shellReducer(shell, { type: "remove", id: "nope" }, NOW)).toBe(shell)
  })

  it("save-result flips saveFailed and is a no-op when unchanged", () => {
    const shell = shellReducer(initialShell(NOW), edit, NOW)
    expect(shellReducer(shell, { type: "save-result", ok: true }, NOW)).toBe(shell)
    const failed = shellReducer(shell, { type: "save-result", ok: false }, NOW)
    expect(failed.saveFailed).toBe(true)
    expect(shellReducer(failed, { type: "save-result", ok: false }, NOW)).toBe(failed)
    expect(shellReducer(failed, { type: "save-result", ok: true }, NOW).saveFailed).toBe(false)
  })

  it("reset clears saved, dirty and saveFailed", () => {
    let shell = shellReducer(initialShell(NOW), { type: "hydrate", state: null }, NOW)
    shell = shellReducer(shell, edit, NOW)
    shell = shellReducer(shell, { type: "save-result", ok: false }, NOW)
    const reset = shellReducer(shell, { type: "reset" }, NOW)
    expect(reset).toMatchObject({ hydrated: true, saved: false, dirty: false, saveFailed: false })
    expect(reset.data).toEqual(seedState(NOW))
  })
})

describe("storage", () => {
  it("uses the agreed keys", () => {
    expect(STORAGE_KEY).toBe("hotdash.product-roadmap.v1")
    expect(REJECTED_KEY).toBe("hotdash.product-roadmap.v1.rejected")
  })

  it("round-trips a state and reports success", () => {
    const state = reducer(seedState(NOW), { type: "add", input: { title: "Round trip" }, at: AT }, NOW)
    expect(saveState(window.localStorage, state)).toBe(true)
    expect(loadState(window.localStorage)).toEqual({ state, rejected: null })
  })

  it("reports failure instead of throwing when the write is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    expect(saveState(window.localStorage, seedState(NOW))).toBe(false)
    expect(saveState(undefined, seedState(NOW))).toBe(false)
    expect(clearState(undefined)).toBe(false)
  })

  it("treats nothing saved as nothing to reject", () => {
    expect(loadState(window.localStorage)).toEqual({ state: null, rejected: null })
    expect(parseRaw(null)).toEqual({ state: null, rejected: null })
    expect(parseRaw("")).toEqual({ state: null, rejected: null })
    expect(loadState(undefined)).toEqual({ state: null, rejected: null })
  })

  it("rejects garbage and bad shapes, handing back the raw text", () => {
    for (const raw of ["{not json", JSON.stringify({ items: [] }), JSON.stringify({ items: {}, nextId: 1 }), JSON.stringify({ items: [], nextId: 0 })]) {
      window.localStorage.setItem(STORAGE_KEY, raw)
      expect(loadState(window.localStorage)).toEqual({ state: null, rejected: raw })
    }
  })

  it("rejects the whole copy when one item is bad", () => {
    const good = seedState(NOW)
    const bad = { ...good, items: good.items.map((i, n) => (n === 2 ? { ...i, owner: "Dan" } : i)) }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toEqual({ state: null, rejected: raw })
  })

  it("quarantines a rejected copy under the .rejected key and warns outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    quarantineRejected(window.localStorage, "{broken")
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe("{broken")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(REJECTED_KEY)
  })

  it("clearState removes only our key", () => {
    window.localStorage.setItem(STORAGE_KEY, "x")
    window.localStorage.setItem(REJECTED_KEY, "y")
    window.localStorage.setItem("other", "z")
    expect(clearState(window.localStorage)).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe("y")
    expect(window.localStorage.getItem("other")).toBe("z")
  })
})

/* --------------------------------------------------------------- provider */

function Probe() {
  const { items, nowMs, persisted, saved, saveFailed, addItem, patchItem, moveItem, reorderItem, removeItem, resetDemoData } =
    useRoadmap()
  const now = inColumn(items, "now")
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
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
    expect(setItem).not.toHaveBeenCalled()
    const updatedBefore = screen.getByTestId("rm-1-updated").textContent

    click("add-nothing")
    click("same-column")
    click("already-top")
    click("same-owner")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("rm-1-updated")).toHaveTextContent(updatedBefore!)
  })

  it("does not re-write a copy it merely found on load", () => {
    const state = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT }, NOW)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
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

  it("persists from the first real edit on, and rehydrates after a remount (reload)", () => {
    const first = mount()
    click("add")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("false")
    click("move-later")
    click("up-3")
    click("remove-8")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("iPad forced updates|Play share links|Probe bet")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"title":"Probe bet"')

    first.unmount()
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("iPad forced updates|Play share links|Probe bet")
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
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("reports a failed write and recovers when the next one lands", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    mount()
    click("add")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("9") // the edit still works for the session
    setItem.mockRestore()
    click("move-later")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
  })

  it("falls back to the seed when the saved copy has one bad item, quarantines it, and overwrites on the next edit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bad = reducer(seedState(NOW), { type: "add", input: { title: "Mine" }, at: AT }, NOW)
    bad.items[3] = { ...bad.items[3], column: "shipped" as never }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe(raw)
    expect(warn).toHaveBeenCalledTimes(1)
    // Nothing is written until the founder edits again; the next edit replaces the bad copy.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    click("add")
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("shipped")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe bet")
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe(raw)
  })

  it("follows a change made in another tab, and a removal brings the seed back", () => {
    mount()
    const other = reducer(seedState(NOW), { type: "add", input: { title: "From another tab", column: "now" }, at: AT }, NOW)
    const raw = JSON.stringify(other)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw, storageArea: window.localStorage }))
    })
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("now-titles")).toHaveTextContent("From another tab")
    // Following is not editing: nothing written back.
    expect(setItem).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: null, storageArea: window.localStorage }))
    })
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
  })

  it("ignores storage events for other keys and other storage areas", () => {
    mount()
    click("add")
    const other = JSON.stringify({ items: [], nextId: 1 })
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "hotdash.feature-requests.v1", newValue: other, storageArea: window.localStorage }))
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: other, storageArea: window.sessionStorage }))
    })
    expect(screen.getByTestId("count")).toHaveTextContent("9")
  })

  it("quarantines a bad copy arriving from another tab and falls back to the seed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mount()
    click("add")
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "{broken", storageArea: window.localStorage }))
    })
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(window.localStorage.getItem(REJECTED_KEY)).toBe("{broken")
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("the seed it falls back to matches the fixture exactly", () => {
    mount()
    const seed = buildSeed(NOW)
    expect(screen.getByTestId("count")).toHaveTextContent(String(seed.length))
  })
})
