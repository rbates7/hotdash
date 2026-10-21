import { describe, expect, it } from "vitest"

import {
  ANNOUNCE_MIN_MS,
  ENTER_MS,
  FLAP_MS,
  MAX_STEPS,
  MAX_TILES,
  RESERVED_DIGITS,
  STAGGER_MS,
  TILE_SIZES,
  announceDelay,
  deltaChip,
  diffGlyphs,
  flapSteps,
  formatCompact,
  formatCount,
  formatTicker,
  maxTilesForWidth,
  placeholderGlyphs,
  planCascade,
  reserveGap,
  reservedWidth,
  rowWidth,
  tickerLabel,
  todayPhrase,
  variantForWidth,
  type Glyph,
} from "@/lib/subscriber-ticker"

const glyphs = (n: number, max = 7) => formatTicker(n, max).glyphs
const chars = (g: readonly Glyph[]) => g.map((x) => x.char).join("")

describe("formatTicker", () => {
  it("shows every digit as a tile up to 7 digits, grouped", () => {
    expect(formatTicker(0, 7).text).toBe("0")
    expect(formatTicker(186, 7).text).toBe("186")
    expect(formatTicker(999, 7).text).toBe("999")
    expect(formatTicker(1_000, 7).text).toBe("1,000")
    expect(formatTicker(12_840, 7).text).toBe("12,840")
    expect(formatTicker(128_400, 7).text).toBe("128,400")
    expect(formatTicker(9_999_999, 7)).toMatchObject({ text: "9,999,999", compact: false, unit: "" })
  })

  it("marks digits as tiles and commas as separators", () => {
    expect(formatTicker(1_284, 7).glyphs).toEqual([
      { kind: "digit", char: "1" },
      { kind: "separator", char: "," },
      { kind: "digit", char: "2" },
      { kind: "digit", char: "8" },
      { kind: "digit", char: "4" },
    ])
  })

  it("switches to compact at 10M on the header (4 tiles + unit)", () => {
    const d = formatTicker(12_400_000, MAX_TILES.header)
    expect(d).toMatchObject({ text: "12.4M", unit: "M", compact: true })
    expect(chars(d.glyphs)).toBe("12.4")
    expect(d.glyphs.filter((g) => g.kind === "digit")).toHaveLength(3)
    expect(formatTicker(10_000_000, 7).text).toBe("10.0M")
  })

  it("allows 5 tiles on the phone bar, then compact", () => {
    expect(formatTicker(99_999, MAX_TILES.bar).text).toBe("99,999")
    expect(formatTicker(128_400, MAX_TILES.bar).text).toBe("128K")
    expect(formatTicker(100_000, MAX_TILES.bar).text).toBe("100K")
    expect(formatTicker(1_284_000, MAX_TILES.bar).text).toBe("1.2M")
    expect(formatTicker(12_400_000, MAX_TILES.bar).text).toBe("12.4M")
  })
})

describe("formatCompact", () => {
  it("floors, so it never shows more than there are", () => {
    expect(formatCompact(12_499_999)).toEqual({ text: "12.4", unit: "M" })
    expect(formatCompact(999_999)).toEqual({ text: "999", unit: "K" })
    expect(formatCompact(99_999)).toEqual({ text: "99.9", unit: "K" })
  })

  it("keeps one decimal under 100 of the unit, whole numbers above", () => {
    expect(formatCompact(1_500)).toEqual({ text: "1.5", unit: "K" })
    expect(formatCompact(128_400)).toEqual({ text: "128", unit: "K" })
    expect(formatCompact(123_456_789)).toEqual({ text: "123", unit: "M" })
    expect(formatCompact(1_200_000_000)).toEqual({ text: "1.2", unit: "B" })
  })

  it("leaves small numbers alone", () => {
    expect(formatCompact(999)).toEqual({ text: "999", unit: "" })
  })
})

describe("formatCount", () => {
  it("groups with commas and drops fractions", () => {
    expect(formatCount(1284)).toBe("1,284")
    expect(formatCount(1284.9)).toBe("1,284")
  })
})

describe("breakpoints", () => {
  it("uses the phone bar below 768 and the header from 768", () => {
    expect(variantForWidth(390)).toBe("bar")
    expect(variantForWidth(767)).toBe("bar")
    expect(variantForWidth(768)).toBe("header")
    expect(variantForWidth(1440)).toBe("header")
  })

  it("caps tiles at 5 on phone and 7 from tablet up", () => {
    expect(maxTilesForWidth(360)).toBe(5)
    expect(maxTilesForWidth(390)).toBe(5)
    expect(maxTilesForWidth(820)).toBe(7)
    expect(maxTilesForWidth(1180)).toBe(7)
    expect(maxTilesForWidth(1440)).toBe(7)
  })

  it("tile radius is 12–14% of the tile width", () => {
    for (const s of Object.values(TILE_SIZES)) {
      const ratio = s.radius / s.width
      expect(ratio).toBeGreaterThanOrEqual(0.12)
      expect(ratio).toBeLessThanOrEqual(0.14)
    }
  })
})

describe("reserved width", () => {
  it("reserves room for 4 digits and their comma", () => {
    const s = TILE_SIZES.header
    expect(reservedWidth("header")).toBe(4 * s.width + s.separator + 4 * s.gap)
    expect(reservedWidth("header")).toBe(rowWidth(glyphs(1_284), "header"))
    expect(reservedWidth("bar")).toBe(rowWidth(glyphs(1_284), "bar"))
  })

  it("pads short counts so 999 → 1,000 does not reflow the header", () => {
    const short = reserveGap(glyphs(186), "header")
    expect(short).toBeGreaterThan(0)
    expect(short + rowWidth(glyphs(186), "header")).toBe(reservedWidth("header"))
    expect(reserveGap(glyphs(1_000), "header")).toBe(0)
    expect(reserveGap(glyphs(128_400), "header")).toBe(0)
  })

  it("an empty row has no width", () => {
    expect(rowWidth([], "header")).toBe(0)
  })
})

describe("placeholderGlyphs", () => {
  it("is four en-dash tiles with the comma, the shape of 1,000", () => {
    const p = placeholderGlyphs()
    expect(chars(p)).toBe("–,–––")
    expect(p.filter((g) => g.kind === "digit")).toHaveLength(RESERVED_DIGITS)
    expect(chars(placeholderGlyphs(3))).toBe("–––")
  })
})

describe("diffGlyphs", () => {
  it("lines up from the right and flags only changed digits", () => {
    const d = diffGlyphs(glyphs(1_284), glyphs(1_294))
    const changed = d.filter((c) => c.changed)
    expect(changed).toEqual([
      expect.objectContaining({ fromRight: 1, from: "8", to: "9", key: "r1-digit" }),
    ])
    expect(d.find((c) => c.fromRight === 0)).toMatchObject({ from: "4", to: "4", changed: false })
  })

  it("adds positions on the left when the number grows", () => {
    const d = diffGlyphs(glyphs(999), glyphs(1_000))
    expect(d.filter((c) => c.from === null).map((c) => [c.key, c.to])).toEqual([
      ["r3-separator", ","],
      ["r4-digit", "1"],
    ])
  })

  it("drops positions when the number shrinks", () => {
    const d = diffGlyphs(glyphs(1_000), glyphs(999))
    expect(d.filter((c) => c.to === null).map((c) => c.key)).toEqual(["r3-separator", "r4-digit"])
  })

  it("treats a digit where a separator was as a new tile, not a flap", () => {
    // 9,999,999 → 10.0M: r1 goes from a digit to the decimal point.
    const d = diffGlyphs(glyphs(9_999_999), glyphs(10_000_000))
    const r1 = d.filter((c) => c.fromRight === 1)
    expect(r1).toEqual([
      expect.objectContaining({ key: "r1-digit", from: "9", to: null }),
      expect.objectContaining({ key: "r1-separator", from: null, to: "." }),
    ])
  })
})

describe("flapSteps", () => {
  it("steps through intermediate values: 4→6 is two flaps", () => {
    expect(flapSteps("3", "4")).toEqual(["4"])
    expect(flapSteps("4", "6")).toEqual(["5", "6"])
  })

  it("rolls forward through 9 → 0 when counting up", () => {
    expect(flapSteps("9", "0")).toEqual(["0"])
    expect(flapSteps("8", "1")).toEqual(["9", "0", "1"])
  })

  it("rolls back when counting down", () => {
    expect(flapSteps("6", "4", "down")).toEqual(["5", "4"])
    expect(flapSteps("0", "9", "down")).toEqual(["9"])
    expect(flapSteps("1", "8", "down")).toEqual(["0", "9", "8"])
  })

  it(`jumps when it would take more than ${MAX_STEPS} flaps`, () => {
    expect(flapSteps("0", "6")).toHaveLength(6)
    expect(flapSteps("0", "7")).toEqual(["7"])
    expect(flapSteps("4", "3")).toEqual(["3"]) // 9 flaps forward
    expect(flapSteps("3", "4", "down")).toEqual(["4"])
  })

  it("is empty for no change and one flap for non-digits", () => {
    expect(flapSteps("5", "5")).toEqual([])
    expect(flapSteps("–", "5")).toEqual(["5"])
    expect(flapSteps(",", ".")).toEqual(["."])
  })

  it("re-planning from a mid-flight digit lands on the new target (retarget)", () => {
    // 2 → 6 in flight; after the first flap lands on 3 the target becomes 4.
    const [first] = flapSteps("2", "6")
    expect(first).toBe("3")
    expect(flapSteps(first, "4")).toEqual(["4"])
  })
})

describe("planCascade", () => {
  it("moves changed digits only, right to left, 40ms apart", () => {
    const plan = planCascade(glyphs(1_284), glyphs(1_295), "up")
    const moving = plan.tiles.filter((t) => t.steps.length > 0)
    expect(moving.map((t) => [t.key, t.delayMs, t.steps])).toEqual([
      ["r1-digit", STAGGER_MS, ["9"]],
      ["r0-digit", 0, ["5"]],
    ])
    // "1", "," and "2" stay still.
    for (const key of ["r4-digit", "r3-separator", "r2-digit"]) {
      expect(plan.tiles.find((t) => t.key === key)).toMatchObject({ steps: [], delayMs: 0, enter: false })
    }
    expect(plan.totalMs).toBe(STAGGER_MS + FLAP_MS)
  })

  it("staggers by rank among changed digits, skipping still ones", () => {
    // 1,284 → 1,385: ones (4→5) and hundreds (2→3) move; tens stay.
    const plan = planCascade(glyphs(1_284), glyphs(1_385), "up")
    const delays = Object.fromEntries(
      plan.tiles.filter((t) => t.steps.length).map((t) => [t.key, t.delayMs])
    )
    expect(delays).toEqual({ "r0-digit": 0, "r2-digit": STAGGER_MS })
  })

  it("counts intermediate flaps into the total", () => {
    const plan = planCascade(glyphs(184), glyphs(186), "up")
    expect(plan.tiles.find((t) => t.key === "r0-digit")?.steps).toEqual(["5", "6"])
    expect(plan.totalMs).toBe(2 * FLAP_MS)
  })

  it("slides new leading tiles in first, then cascades", () => {
    const plan = planCascade(glyphs(999), glyphs(1_000), "up")
    expect(plan.tiles.map((t) => t.key)).toEqual([
      "r4-digit",
      "r3-separator",
      "r2-digit",
      "r1-digit",
      "r0-digit",
    ])
    expect(plan.tiles.filter((t) => t.enter).map((t) => t.key)).toEqual(["r4-digit", "r3-separator"])
    const moving = plan.tiles.filter((t) => t.steps.length)
    expect(moving.map((t) => t.delayMs)).toEqual([
      ENTER_MS + 2 * STAGGER_MS,
      ENTER_MS + STAGGER_MS,
      ENTER_MS,
    ])
    expect(plan.totalMs).toBe(ENTER_MS + 2 * STAGGER_MS + FLAP_MS)
  })

  it("is a no-op for the same number", () => {
    const plan = planCascade(glyphs(1_284), glyphs(1_284), "up")
    expect(plan.tiles.every((t) => t.steps.length === 0 && !t.enter)).toBe(true)
    expect(plan.totalMs).toBe(0)
  })

  it("rolls down on a decrease", () => {
    const plan = planCascade(glyphs(186), glyphs(184), "down")
    expect(plan.direction).toBe("down")
    expect(plan.tiles.find((t) => t.key === "r0-digit")?.steps).toEqual(["5", "4"])
  })
})

describe("labels", () => {
  it("reads the full figure and today's change", () => {
    expect(tickerLabel(1_284, 3)).toBe("Paying subscribers: 1,284, up 3 today")
    expect(tickerLabel(12_400_000, -2)).toBe("Paying subscribers: 12,400,000, down 2 today")
    expect(tickerLabel(186, 0)).toBe("Paying subscribers: 186, no change today")
  })

  it("phrases today and the delta chip", () => {
    expect(todayPhrase(1_200)).toBe("up 1,200 today")
    expect(deltaChip(3)).toBe("+3")
    expect(deltaChip(-2)).toBe("−2")
    expect(deltaChip(0)).toBeNull()
  })
})

describe("announceDelay", () => {
  it("speaks the first change at once: the first-paint label is never announced", () => {
    expect(announceDelay(null, 5_000)).toBe(0)
  })

  it("holds a change for the rest of the minute after an announcement", () => {
    expect(ANNOUNCE_MIN_MS).toBe(60_000)
    expect(announceDelay(10_000, 10_000)).toBe(60_000)
    expect(announceDelay(10_000, 30_000)).toBe(40_000)
    expect(announceDelay(10_000, 69_999)).toBe(1)
  })

  it("is free again once the minute is up", () => {
    expect(announceDelay(10_000, 70_000)).toBe(0)
    expect(announceDelay(10_000, 500_000)).toBe(0)
  })

  it("takes a custom gap", () => {
    expect(announceDelay(0, 1_000, 5_000)).toBe(4_000)
  })
})
