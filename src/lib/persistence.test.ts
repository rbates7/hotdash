import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createStorage,
  dedupe,
  isFiniteNumber,
  isIsoInstant,
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

  it("is empty when nothing is stored, and drops legacy keys on the way", () => {
    window.localStorage.setItem("hotdash.test.v1", "{}")
    expect(store.load(window.localStorage)).toEqual({ state: null, status: "empty" })
    expect(window.localStorage.getItem("hotdash.test.v1")).toBeNull()
    expect(store.has(window.localStorage)).toBe(false)
  })

  it("parks a copy that fails validation under <key>.rejected, warns in dev, and clears the live key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    window.localStorage.setItem(store.key, JSON.stringify({ n: "not a number", name: "x" }))
    expect(store.load(window.localStorage)).toEqual({ state: null, status: "rejected" })
    expect(window.localStorage.getItem(store.rejectedKey)).toBe(JSON.stringify({ n: "not a number", name: "x" }))
    expect(window.localStorage.getItem(store.key)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed validation"), "")
    // A later save does not disturb the parked copy.
    store.save(window.localStorage, { n: 2, name: "b" })
    expect(window.localStorage.getItem(store.rejectedKey)).toContain("not a number")
  })

  it("parks a copy that is not JSON", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    window.localStorage.setItem(store.key, "{not json")
    expect(store.load(window.localStorage).status).toBe("rejected")
    expect(window.localStorage.getItem(store.rejectedKey)).toBe("{not json")
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
})
