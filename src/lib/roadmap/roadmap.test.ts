import { describe, expect, it } from "vitest"

import { buildSeed, seedState } from "@/lib/roadmap/fixture"
import {
  COLUMN_ORDER,
  OWNERS,
  idNumber,
  inColumn,
  isColumn,
  isIsoInstant,
  isOwner,
  normalizeColumn,
  parseItem,
  parseState,
  type RoadmapItem,
} from "@/lib/roadmap/roadmap"

const TODAY = Date.parse("2026-10-07T15:00:00.000Z")

describe("enums", () => {
  it("guard columns and owners without casts", () => {
    expect(COLUMN_ORDER).toEqual(["now", "next", "later"])
    for (const c of COLUMN_ORDER) expect(isColumn(c)).toBe(true)
    expect(isColumn("done")).toBe(false)
    expect(isColumn(undefined)).toBe(false)
    expect(isColumn(0)).toBe(false)

    expect(OWNERS).toEqual(["Rashad", "Mace"])
    expect(isOwner("Rashad")).toBe(true)
    expect(isOwner("Mace")).toBe(true)
    expect(isOwner("rashad")).toBe(false)
    expect(isOwner("Dan")).toBe(false)
    expect(isOwner(null)).toBe(false)
  })
})

describe("ordering", () => {
  it("lists a column by order, breaking ties by id so the order is total", () => {
    const seed = buildSeed(TODAY)
    expect(inColumn(seed, "now").map((i) => i.order)).toEqual([0, 1, 2])
    const tied = seed.map((i) => (i.column === "now" ? { ...i, order: 5 } : i))
    expect(inColumn(tied, "now").map((i) => i.id)).toEqual(["rm-1", "rm-2", "rm-3"])
    // Does not mutate.
    expect(seed.map((i) => i.id)).toEqual(buildSeed(TODAY).map((i) => i.id))
  })

  it("normalizes one column to 0..n-1 and leaves the others untouched", () => {
    const seed = buildSeed(TODAY)
    const gappy = seed.map((i) =>
      i.column === "next" ? { ...i, order: i.order * 10 + 7 } : i
    )
    const fixed = normalizeColumn(gappy, "next")
    expect(inColumn(fixed, "next").map((i) => i.order)).toEqual([0, 1, 2])
    for (const i of fixed.filter((x) => x.column !== "next")) {
      expect(i).toBe(gappy.find((g) => g.id === i.id)) // same object: untouched
    }
  })

  it("idNumber reads rm-n and rejects anything else", () => {
    expect(idNumber("rm-7")).toBe(7)
    expect(idNumber("rm-12")).toBe(12)
    expect(idNumber("fr-7")).toBe(-1)
    expect(idNumber("rm-")).toBe(-1)
    expect(idNumber("rm-7x")).toBe(-1)
  })
})

describe("isIsoInstant", () => {
  it("accepts only strings that round-trip exactly", () => {
    expect(isIsoInstant("2026-10-07T15:00:00.000Z")).toBe(true)
    expect(isIsoInstant("2026-10-07T15:00:00Z")).toBe(false) // parses, but prints differently
    expect(isIsoInstant("2026-10-07")).toBe(false)
    expect(isIsoInstant("yesterday-ish")).toBe(false)
    expect(isIsoInstant(1_760_000_000_000)).toBe(false)
    expect(isIsoInstant("")).toBe(false)
  })
})

describe("parseItem", () => {
  const good = buildSeed(TODAY)[1] // Play share links: has fromFeatureRequest and sample

  it("accepts a sound item and returns a fresh copy with only the known keys", () => {
    const parsed = parseItem({ ...good, extra: "nope", nested: { a: 1 } })
    expect(parsed).toEqual(good)
    expect(parsed).not.toBe(good)
    expect(Object.keys(parsed!).sort()).toEqual(Object.keys(good).sort())
    expect("extra" in parsed!).toBe(false)
  })

  it("keeps optional flags only when they are exactly true", () => {
    const { fromFeatureRequest: _f, sample: _s, ...plain } = good
    void _f
    void _s
    const parsed = parseItem(plain)!
    expect("fromFeatureRequest" in parsed).toBe(false)
    expect("sample" in parsed).toBe(false)
    expect(parseItem({ ...plain, sample: false })).toBeNull()
    expect(parseItem({ ...plain, sample: "yes" })).toBeNull()
    expect(parseItem({ ...plain, fromFeatureRequest: 1 })).toBeNull()
  })

  it.each<[string, Partial<Record<keyof RoadmapItem, unknown>>]>([
    ["empty id", { id: "" }],
    ["id not rm-n", { id: "fr-2" }],
    ["missing title", { title: undefined }],
    ["blank title", { title: "   " }],
    ["title over the cap", { title: "x".repeat(81) }],
    ["why not a string", { why: null }],
    ["why over the cap", { why: "y".repeat(161) }],
    ["unknown owner", { owner: "Dan" }],
    ["lower-case owner", { owner: "mace" }],
    ["window not a string", { window: 2026 }],
    ["window over the cap", { window: "w".repeat(25) }],
    ["unknown column", { column: "done" }],
    ["negative order", { order: -1 }],
    ["fractional order", { order: 1.5 }],
    ["order as string", { order: "1" }],
    ["negative tickets", { linkedTickets: -2 }],
    ["tickets not a number", { linkedTickets: "3" }],
    ["signedAt not strict ISO", { signedAt: "2026-10-07T15:00:00Z" }],
    ["signedAt garbage", { signedAt: "last week" }],
    ["updatedAt a number", { updatedAt: 1_760_000_000_000 }],
  ])("refuses %s", (_label, patch) => {
    expect(parseItem({ ...good, ...patch })).toBeNull()
  })

  it("refuses non-objects", () => {
    expect(parseItem(null)).toBeNull()
    expect(parseItem("rm-1")).toBeNull()
    expect(parseItem([])).toBeNull()
    expect(parseItem(42)).toBeNull()
  })
})

describe("parseState", () => {
  it("accepts the seed, after a JSON round trip, and strips unknown keys at both levels", () => {
    const state = seedState(TODAY)
    const raw = JSON.parse(JSON.stringify({ ...state, version: 1, items: state.items.map((i) => ({ ...i, extra: true })) }))
    const parsed = parseState(raw)
    expect(parsed).toEqual(state)
    expect(Object.keys(parsed!)).toEqual(["items", "nextId"])
  })

  it("refuses the whole copy when one item is bad", () => {
    const state = seedState(TODAY)
    const bad = { ...state, items: state.items.map((i, n) => (n === 4 ? { ...i, column: "shipped" } : i)) }
    expect(parseState(bad)).toBeNull()
  })

  it("refuses duplicate ids", () => {
    const state = seedState(TODAY)
    expect(parseState({ ...state, items: [...state.items, { ...state.items[0] }] })).toBeNull()
  })

  it("requires nextId to be an integer above every id in use", () => {
    const state = seedState(TODAY) // ids rm-1..rm-8, nextId 9
    expect(parseState(state)).not.toBeNull()
    expect(parseState({ ...state, nextId: 8 })).toBeNull() // would hand out rm-8 again
    expect(parseState({ ...state, nextId: 100 })).not.toBeNull()
    expect(parseState({ ...state, nextId: 0 })).toBeNull()
    expect(parseState({ ...state, nextId: 9.5 })).toBeNull()
    expect(parseState({ ...state, nextId: "9" })).toBeNull()
    expect(parseState({ items: [], nextId: 1 })).toEqual({ items: [], nextId: 1 })
    expect(parseState({ items: [], nextId: 0 })).toBeNull()
  })

  it("refuses wrong shapes", () => {
    expect(parseState(null)).toBeNull()
    expect(parseState("{}")).toBeNull()
    expect(parseState({})).toBeNull()
    expect(parseState({ items: {}, nextId: 1 })).toBeNull()
    expect(parseState({ items: [] })).toBeNull()
  })
})
