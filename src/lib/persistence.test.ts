import { afterEach, describe, expect, it, vi } from "vitest"

import {
  REJECTED_KEEP,
  createStorage,
  dedupe,
  initialShell,
  isFiniteNumber,
  isIsoInstant,
  parseAll,
  persistenceShellReducer,
  type LoadResult,
  type PersistenceShell,
} from "@/lib/persistence"

const T0 = Date.parse("2026-10-07T12:00:00.000Z")
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

type Thing = { n: number; name: string }
const isThing = (v: unknown): v is Thing =>
  !!v && typeof v === "object" && isFiniteNumber((v as Thing).n) && typeof (v as Thing).name === "string"

const store = createStorage<Thing>({
  key: "hotdash.test.v2",
  legacyKeys: ["hotdash.test.v1"],
  validate: isThing,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createStorage", () => {
  it("round-trips a valid copy and reports it as saved", () => {
    expect(store.save(window.localStorage, { n: 1, name: "a" })).toBe(true)
    expect(store.has(window.localStorage)).toBe(true)
    expect(store.load(window.localStorage)).toEqual({ state: { n: 1, name: "a" }, status: "saved" })
  })

  it("is empty when nothing is stored; load never writes (legacy keys wait for the first save)", () => {
    window.localStorage.setItem("hotdash.test.v1", "{}")
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const removeItem = vi.spyOn(Storage.prototype, "removeItem")
    expect(store.load(window.localStorage)).toEqual({ state: null, status: "empty" })
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem("hotdash.test.v1")).toBe("{}")
    expect(store.has(window.localStorage)).toBe(false)

    store.save(window.localStorage, { n: 1, name: "a" })
    expect(window.localStorage.getItem("hotdash.test.v1")).toBeNull()
  })

  it("skips the write when the copy is already there, so a save never echoes", () => {
    store.save(window.localStorage, { n: 1, name: "a" })
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(store.save(window.localStorage, { n: 1, name: "a" })).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    expect(store.save(window.localStorage, { n: 2, name: "a" })).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it("serialize decides what is written, so volatile fields stay out", () => {
    type WithClock = Thing & { now: string }
    const s = createStorage<WithClock, Thing>({
      key: "hotdash.test-clock.v2",
      parse: (v) => (isThing(v) ? { n: v.n, name: v.name } : null),
      serialize: ({ n, name }) => ({ n, name }),
    })
    s.save(window.localStorage, { n: 1, name: "a", now: "2026-10-07T00:00:00.000Z" })
    expect(window.localStorage.getItem(s.key)).toBe(JSON.stringify({ n: 1, name: "a" }))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    s.save(window.localStorage, { n: 1, name: "a", now: "2026-10-07T00:00:01.000Z" })
    expect(setItem).not.toHaveBeenCalled()
    expect(s.load(window.localStorage)).toEqual({ state: { n: 1, name: "a" }, status: "saved" })
  })

  it("load() is pure: a copy that fails validation is reported, warned about in dev, and left in place", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const removeItem = vi.spyOn(Storage.prototype, "removeItem")
    const raw = JSON.stringify({ n: "not a number", name: "x" })
    window.localStorage.setItem(store.key, raw)
    setItem.mockClear()
    const result = store.load(window.localStorage)
    expect(result.status).toBe("rejected")
    if (result.status !== "rejected") throw new Error("unreachable")
    expect(result.rejected.raw).toBe(raw)
    expect(result.rejected.why).toBe("failed validation")
    expect(isIsoInstant(result.rejected.at)).toBe(true)
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(store.key)).toBe(raw) // still there — other tabs are not told to re-seed
    expect(store.rejected(window.localStorage)).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed validation"), "")
  })

  it("the first real save parks the bad copy under <key>.rejected (timestamped) before overwriting it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ n: "not a number", name: "x" })
    window.localStorage.setItem(store.key, raw)
    expect(store.save(window.localStorage, { n: 2, name: "b" })).toBe(true)
    const parked = store.rejected(window.localStorage)
    expect(parked).toHaveLength(1)
    expect(parked[0].raw).toBe(raw)
    expect(parked[0].why).toBe("failed validation")
    expect(store.load(window.localStorage)).toEqual({ state: { n: 2, name: "b" }, status: "saved" })
    // Later saves leave the parked copy alone.
    store.save(window.localStorage, { n: 3, name: "c" })
    expect(store.rejected(window.localStorage)[0].raw).toBe(raw)
  })

  it("quarantine() parks without touching the live key, and save() never removes or clears it (no storage-event clear for other tabs)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    window.localStorage.setItem(store.key, "{bad")
    const result = store.load(window.localStorage)
    if (result.status !== "rejected") throw new Error("unreachable")
    const removeItem = vi.spyOn(Storage.prototype, "removeItem")
    const clear = vi.spyOn(Storage.prototype, "clear")
    store.quarantine(window.localStorage, result.rejected)
    expect(window.localStorage.getItem(store.key)).toBe("{bad")
    expect(store.rejected(window.localStorage)[0].raw).toBe("{bad")
    store.save(window.localStorage, { n: 1, name: "a" })
    expect(removeItem).not.toHaveBeenCalledWith(store.key)
    expect(clear).not.toHaveBeenCalled()
    expect(store.load(window.localStorage)).toEqual({ state: { n: 1, name: "a" }, status: "saved" })
  })

  it("keeps the last three rejected copies, newest first; a second one never overwrites the first", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    for (let i = 1; i <= REJECTED_KEEP + 1; i++) {
      window.localStorage.setItem(store.key, `{bad ${i}`)
      store.save(window.localStorage, { n: i, name: "ok" })
    }
    const parked = store.rejected(window.localStorage)
    expect(parked).toHaveLength(REJECTED_KEEP)
    expect(parked.map((p) => p.raw)).toEqual(["{bad 4", "{bad 3", "{bad 2"])
    expect(parked.every((p) => p.why === "is not JSON")).toBe(true)
  })

  it("returns false and warns when the write fails (quota / private mode)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const full = quotaExceededStorage()
    expect(store.save(full, { n: 1, name: "a" })).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not save"), expect.anything())
    expect(store.has(full)).toBe(false)
  })

  it("survives a storage that throws on read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const broken = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(store.load(broken)).toEqual({ state: null, status: "error" })
    expect(store.has(broken)).toBe(false)
    expect(() => store.clear(broken)).not.toThrow()
  })

  it("clear removes the live key only", () => {
    store.save(window.localStorage, { n: 1, name: "a" })
    window.localStorage.setItem(store.rejectedKey, "old")
    store.clear(window.localStorage)
    expect(window.localStorage.getItem(store.key)).toBeNull()
    expect(window.localStorage.getItem(store.rejectedKey)).toBe("old")
  })

  it("subscribe hears another tab's write and clear on our key, and ignores other keys", () => {
    const onChange = vi.fn()
    const off = store.subscribe(onChange)

    window.localStorage.setItem(store.key, JSON.stringify({ n: 7, name: "other tab" }))
    fireStorageEvent(store.key, window.localStorage.getItem(store.key))
    expect(onChange).toHaveBeenLastCalledWith({ state: { n: 7, name: "other tab" }, status: "saved" })

    fireStorageEvent("somebody.else", "x")
    expect(onChange).toHaveBeenCalledTimes(1)

    window.localStorage.removeItem(store.key)
    fireStorageEvent(null, null) // Storage.clear() in the other tab
    expect(onChange).toHaveBeenLastCalledWith({ state: null, status: "empty" })

    off()
    fireStorageEvent(store.key, "{}")
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe("createStorage · other storage areas", () => {
  it("subscribe ignores events from other storage areas, even on our key", () => {
    const onChange = vi.fn()
    const off = store.subscribe(onChange)
    store.save(window.localStorage, { n: 1, name: "ours" })
    window.dispatchEvent(
      new StorageEvent("storage", { key: store.key, newValue: null, storageArea: window.sessionStorage })
    )
    expect(onChange).not.toHaveBeenCalled()
    off()
  })
})

describe("persistenceShellReducer", () => {
  const seed: Thing = { n: 0, name: "seed" }
  const seedAt = (nowMs: number): Thing => ({ n: 0, name: `seed@${nowMs}` })
  const empty: LoadResult<Thing> = { state: null, status: "empty" }
  const found = (state: Thing): LoadResult<Thing> => ({ state, status: "saved" })
  const edit = (shell: PersistenceShell<Thing>, data: Thing) =>
    persistenceShellReducer(shell, { type: "edit", data })
  const hydrate = (shell: PersistenceShell<Thing>, result: LoadResult<Thing>, nowMs = T0) =>
    persistenceShellReducer(shell, { type: "hydrate", result, nowMs, fallback: seedAt })
  const saved = (shell: PersistenceShell<Thing>, ok = true) =>
    persistenceShellReducer(shell, { type: "save-result", ok })

  it("starts unhydrated and never-edited, with the request clock and no edits counted", () => {
    expect(initialShell(seed, T0)).toEqual({
      data: seed, edits: 0, savedEdits: 0, nowMs: T0, persisted: false, edited: false, saved: false, saveFailed: false,
    })
  })

  it("hydrate adopts a saved copy (saved, not edited, clock untouched) or builds the fallback lazily from nowMs", () => {
    const fallback = vi.fn(seedAt)
    const applied = persistenceShellReducer(initialShell(seed, T0), { type: "hydrate", result: found({ n: 1, name: "a" }), nowMs: T0 + 5, fallback })
    expect(applied).toMatchObject({ data: { n: 1, name: "a" }, nowMs: T0, persisted: true, edited: false, saved: true, saveFailed: false })
    expect(fallback).not.toHaveBeenCalled()
    for (const result of [empty, { state: null, status: "error" } as LoadResult<Thing>, { state: null, status: "rejected", rejected: { at: "x", raw: "{", why: "is not JSON" } } as LoadResult<Thing>]) {
      const none = hydrate(initialShell(seed, T0), result, T0 + 9)
      expect(none).toMatchObject({ data: seedAt(T0 + 9), nowMs: T0 + 9, persisted: true, edited: false, saved: false })
    }
    const adopted = persistenceShellReducer<Thing, { n: number }>(initialShell(seed, T0), {
      type: "hydrate",
      result: { state: { n: 5 }, status: "saved" },
      nowMs: T0,
      fallback: seedAt,
      adopt: (s) => ({ data: { n: s.n, name: "adopted" }, nowMs: T0 + 1 }),
    })
    expect(adopted.data).toEqual({ n: 5, name: "adopted" })
    expect(adopted.nowMs).toBe(T0 + 1)
  })

  it("a hydrate after a *saved* edit is not an edit: another tab's copy is theirs, the edit counter does not move", () => {
    let shell = hydrate(initialShell(seed, T0), empty)
    shell = saved(edit(shell, { n: 1, name: "mine" }))
    expect(shell).toMatchObject({ edited: true, edits: 1, savedEdits: 1 })
    shell = hydrate(shell, found({ n: 2, name: "theirs" }))
    expect(shell).toMatchObject({ data: { n: 2, name: "theirs" }, edits: 1, edited: false, saved: true })
    // Their Reset (no copy) re-seeds this tab from the moment it hears it.
    shell = hydrate(shell, empty, T0 + 60_000)
    expect(shell).toMatchObject({ data: seedAt(T0 + 60_000), nowMs: T0 + 60_000, edits: 1, edited: false, saved: false })
  })

  it("a local edit that has not been saved yet wins over an incoming copy (same-render race)", () => {
    let shell = hydrate(initialShell(seed, T0), empty)
    shell = edit(shell, { n: 1, name: "mine, unsaved" })
    const raced = hydrate(shell, found({ n: 2, name: "theirs" }))
    expect(raced.data).toEqual({ n: 1, name: "mine, unsaved" })
    // Flags untouched: "saved" is only ever set by our own write's result.
    expect(raced).toMatchObject({ edited: true, edits: 1, savedEdits: 0, saved: false, saveFailed: false })
    // Once the pending save lands, the next copy is adopted as usual.
    const settled = hydrate(saved(raced), found({ n: 3, name: "later" }))
    expect(settled.data).toEqual({ n: 3, name: "later" })
  })

  it("a failed save is never masked by an incoming copy; another tab's Reset still re-seeds and clears the pending state", () => {
    let shell = hydrate(initialShell(seed, T0), empty)
    shell = saved(edit(shell, { n: 1, name: "mine" }), false)
    expect(shell).toMatchObject({ edited: true, saved: false, saveFailed: true, edits: 1, savedEdits: 0 })
    const incoming = hydrate(shell, found({ n: 2, name: "theirs" }))
    expect(incoming.data).toEqual({ n: 1, name: "mine" })
    expect(incoming).toMatchObject({ edited: true, saved: false, saveFailed: true })
    expect(incoming).toBe(shell) // identity: nothing changed
    const reseeded = hydrate(incoming, empty, T0 + 7)
    expect(reseeded).toMatchObject({ data: seedAt(T0 + 7), nowMs: T0 + 7, edited: false, saved: false, saveFailed: false, savedEdits: 1 })
    // The next local edit moves `edits` past `savedEdits` again → a write is attempted.
    expect(edit(reseeded, { n: 3, name: "retry" })).toMatchObject({ edits: 2, savedEdits: 1, edited: true })
  })

  it("a real edit flips edited and counts; a no-op edit returns the very same shell; saved waits for the write", () => {
    const shell = hydrate(initialShell(seed, T0), empty)
    expect(edit(shell, shell.data)).toBe(shell)
    const changed = edit(shell, { n: 1, name: "changed" })
    expect(changed).toMatchObject({ data: { n: 1, name: "changed" }, edits: 1, edited: true, saved: false, persisted: true })
    expect(edit(changed, changed.data)).toBe(changed)
    expect(edit(changed, { n: 2, name: "again" }).edits).toBe(2)
  })

  it("save-result sets saved and savedEdits on success, saveFailed on failure, and is identity when nothing changes", () => {
    const shell = edit(initialShell(seed, T0), { n: 1, name: "a" })
    const ok = saved(shell)
    expect(ok).toMatchObject({ saved: true, saveFailed: false, savedEdits: 1 })
    expect(saved(ok)).toBe(ok)
    const failed = saved(ok, false)
    expect(failed).toMatchObject({ saved: true, saveFailed: true })
    expect(saved(failed, false)).toBe(failed)
    expect(saved(failed).saveFailed).toBe(false)
  })

  it("reset re-seeds from its own nowMs, moves the clock, and returns to never-edited", () => {
    let shell = hydrate(initialShell(seed, T0), empty)
    shell = edit(shell, { n: 1, name: "a" })
    shell = saved(shell, false)
    const later = T0 + 86_400_000
    expect(persistenceShellReducer(shell, { type: "reset", nowMs: later, seed: seedAt })).toEqual({
      data: seedAt(later), nowMs: later, edits: 1, savedEdits: 1, persisted: true, edited: false, saved: false, saveFailed: false,
    })
  })
})

describe("guards", () => {
  it("isIsoInstant accepts only round-tripping timestamps", () => {
    expect(isIsoInstant("2026-08-27T14:00:00.000Z")).toBe(true)
    expect(isIsoInstant("2026-08-27")).toBe(false)
    expect(isIsoInstant("nope")).toBe(false)
    expect(isIsoInstant(123)).toBe(false)
  })

  it("dedupe keeps first-seen order", () => {
    expect(dedupe(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"])
  })

  it("parseAll rejects the whole list on one bad item and strips to the parsed shape", () => {
    const parseNum = (v: unknown) => (isFiniteNumber(v) ? { n: v } : null)
    expect(parseAll([1, 2], parseNum)).toEqual([{ n: 1 }, { n: 2 }])
    expect(parseAll([1, "x"], parseNum)).toBeNull()
    expect(parseAll("nope", parseNum)).toBeNull()
  })
})
