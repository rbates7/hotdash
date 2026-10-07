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

  it("parks a copy that fails validation under <key>.rejected (timestamped), warns in dev, and clears the live key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ n: "not a number", name: "x" })
    window.localStorage.setItem(store.key, raw)
    expect(store.load(window.localStorage)).toEqual({ state: null, status: "rejected" })
    const parked = store.rejected(window.localStorage)
    expect(parked).toHaveLength(1)
    expect(parked[0].raw).toBe(raw)
    expect(parked[0].why).toBe("failed validation")
    expect(isIsoInstant(parked[0].at)).toBe(true)
    expect(window.localStorage.getItem(store.key)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed validation"), "")
    // A later save does not disturb the parked copy.
    store.save(window.localStorage, { n: 2, name: "b" })
    expect(store.rejected(window.localStorage)[0].raw).toBe(raw)
  })

  it("keeps the last three rejected copies, newest first; a second one never overwrites the first", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    for (let i = 1; i <= REJECTED_KEEP + 1; i++) {
      window.localStorage.setItem(store.key, `{bad ${i}`)
      store.load(window.localStorage)
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
  const empty: LoadResult<Thing> = { state: null, status: "empty" }
  const found = (state: Thing): LoadResult<Thing> => ({ state, status: "saved" })
  const edit = (shell: PersistenceShell<Thing>, data: Thing) =>
    persistenceShellReducer(shell, { type: "edit", data })
  const hydrate = (shell: PersistenceShell<Thing>, result: LoadResult<Thing>) =>
    persistenceShellReducer(shell, { type: "hydrate", result, fallback: seed })

  it("starts unhydrated and never-edited, with no edits counted", () => {
    expect(initialShell(seed)).toEqual({
      data: seed, edits: 0, persisted: false, edited: false, saved: false, saveFailed: false,
    })
  })

  it("hydrate applies a saved copy (saved, not edited) or the fallback (neither), via adopt when given", () => {
    const applied = hydrate(initialShell(seed), found({ n: 1, name: "a" }))
    expect(applied).toEqual({ data: { n: 1, name: "a" }, edits: 0, persisted: true, edited: false, saved: true, saveFailed: false })
    for (const status of ["empty", "rejected", "error"] as const) {
      const none = hydrate(initialShell(seed), { state: null, status })
      expect(none).toEqual({ data: seed, edits: 0, persisted: true, edited: false, saved: false, saveFailed: false })
    }
    const adopted = persistenceShellReducer<Thing, { n: number }>(initialShell(seed), {
      type: "hydrate",
      result: { state: { n: 5 }, status: "saved" },
      fallback: seed,
      adopt: (saved) => ({ n: saved.n, name: "adopted" }),
    })
    expect(adopted.data).toEqual({ n: 5, name: "adopted" })
  })

  it("a hydrate after edits is not an edit: another tab's copy is theirs, the edit counter does not move", () => {
    let shell = hydrate(initialShell(seed), empty)
    shell = edit(shell, { n: 1, name: "mine" })
    expect(shell.edited).toBe(true)
    expect(shell.edits).toBe(1)
    shell = hydrate(shell, found({ n: 2, name: "theirs" }))
    expect(shell).toMatchObject({ data: { n: 2, name: "theirs" }, edits: 1, edited: false, saved: true })
    // Their Reset (no copy) re-seeds this tab with the fallback.
    shell = hydrate(shell, empty)
    expect(shell).toMatchObject({ data: seed, edits: 1, edited: false, saved: false })
  })

  it("a real edit flips edited and counts; a no-op edit returns the very same shell; saved waits for the write", () => {
    const shell = hydrate(initialShell(seed), empty)
    expect(edit(shell, shell.data)).toBe(shell)
    const changed = edit(shell, { n: 1, name: "changed" })
    expect(changed).toMatchObject({ data: { n: 1, name: "changed" }, edits: 1, edited: true, saved: false, persisted: true })
    expect(edit(changed, changed.data)).toBe(changed)
    expect(edit(changed, { n: 2, name: "again" }).edits).toBe(2)
  })

  it("save-result sets saved on success, saveFailed on failure, and is identity when nothing changes", () => {
    const shell = edit(initialShell(seed), { n: 1, name: "a" })
    const ok = persistenceShellReducer(shell, { type: "save-result", ok: true })
    expect(ok).toMatchObject({ saved: true, saveFailed: false })
    expect(persistenceShellReducer(ok, { type: "save-result", ok: true })).toBe(ok)
    const failed = persistenceShellReducer(ok, { type: "save-result", ok: false })
    expect(failed).toMatchObject({ saved: true, saveFailed: true }) // an earlier copy may still be there
    expect(persistenceShellReducer(failed, { type: "save-result", ok: false })).toBe(failed)
    expect(persistenceShellReducer(failed, { type: "save-result", ok: true }).saveFailed).toBe(false)
  })

  it("reset returns to never-edited with the given seed, keeping persisted and the counter", () => {
    let shell = hydrate(initialShell(seed), empty)
    shell = edit(shell, { n: 1, name: "a" })
    shell = persistenceShellReducer(shell, { type: "save-result", ok: false })
    const fresh: Thing = { n: 0, name: "fresh seed" }
    expect(persistenceShellReducer(shell, { type: "reset", data: fresh })).toEqual({
      data: fresh, edits: 1, persisted: true, edited: false, saved: false, saveFailed: false,
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
