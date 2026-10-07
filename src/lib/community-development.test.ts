import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEFAULT_OWNER,
  INITIATIVE_LIMITS,
  SEED_INITIATIVE_IDS,
  daysAgoThisYear,
  describeInitiative,
  filterInitiatives,
  formatWhen,
  initiativeNumber,
  isDoneThisYear,
  isInitiative,
  isSeedInitiative,
  isUpcomingIn,
  matchesFilters,
  normalizeInput,
  sameInitiative,
  seedInitiatives,
  sortInitiatives,
  stripInitiative,
  summarize,
  yearOf,
  type Initiative,
  type InitiativeInput,
} from "@/lib/community-development"
import { addDays, formatDate, formatRelativeDay, todayIn } from "@/lib/clock"
import { LATE_EVENING_CT } from "@/test/clock"

afterEach(() => vi.useRealTimers())

const TODAY = "2026-10-07"
const seed = seedInitiatives(TODAY)
const one = seed[0]

const input = (over: Partial<InitiativeInput> = {}): InitiativeInput => ({
  name: "Test give-back day",
  type: "volunteer",
  partner: "Houston Food Bank",
  date: "2026-10-20",
  cadence: "",
  status: "planned",
  owner: "Rashad",
  impact: "40 kids coached",
  ...over,
})

describe("seed", () => {
  it("is eight unique initiative-n rows that all pass the guard", () => {
    expect(seed).toHaveLength(8)
    expect(seed.every(isInitiative)).toBe(true)
    expect(new Set(seed.map((r) => r.id)).size).toBe(8)
    expect([...SEED_INITIATIVE_IDS]).toEqual(seed.map((r) => r.id))
    expect(isSeedInitiative({ id: "initiative-3" })).toBe(true)
    expect(isSeedInitiative({ id: "initiative-9" })).toBe(false)
    expect(initiativeNumber("initiative-12")).toBe(12)
    expect(initiativeNumber("clinic-12")).toBe(0)
  })

  it("covers every type and status Rashad asked for, with no dollar totals", () => {
    expect(new Set(seed.map((r) => r.type))).toEqual(
      new Set(["volunteer", "donation", "foundation", "outreach"])
    )
    expect(new Set(seed.map((r) => r.status))).toEqual(new Set(["idea", "planned", "active", "done"]))
    expect(seed.some((r) => r.name.includes("flag-football"))).toBe(true)
    expect(seed.some((r) => r.impact === "12 iPads")).toBe(true)
    expect(seed.some((r) => r.type === "foundation" && r.status === "idea")).toBe(true)
    expect(seed.every((r) => !/\$|USD|dollar/i.test(`${r.name}${r.impact}${r.cadence}`))).toBe(true)
  })

  it("keeps the same summary split relative to any other day", () => {
    for (const day of ["2026-10-07", "2025-12-31", "2027-03-14", "2026-01-01"]) {
      const rows = seedInitiatives(day)
      const s = summarize(rows, day)
      expect(s.active).toBe(2)
      expect(s.upcoming).toBe(3)
      expect(s.doneThisYear).toBe(1)
      expect(rows.filter((r) => r.status === "idea")).toHaveLength(2)
    }
  })
})

describe("Upcoming and Done this year are decided on Central calendar days", () => {
  /** 23:30 Central on 7 Oct 2026 (CDT, UTC−5): UTC already reads 8 Oct. */
  it("a row dated today is still upcoming at 23:30 CT", () => {
    expect(todayIn(LATE_EVENING_CT)).toBe("2026-10-07")
    expect(LATE_EVENING_CT.getUTCDate()).toBe(8)
    const row = { date: "2026-10-07", status: "planned" as const }
    expect(isUpcomingIn(row, "2026-10-07", 30)).toBe(true)
    expect(isUpcomingIn(row, "2026-10-08", 30)).toBe(false)
  })

  it("daysAgoThisYear never crosses into last year", () => {
    expect(daysAgoThisYear("2026-10-07", 40)).toBe("2026-08-28")
    expect(daysAgoThisYear("2026-01-10", 40)).toBe("2026-01-01")
    expect(daysAgoThisYear("2026-01-01", 40)).toBe("2026-01-01")
    expect(yearOf(daysAgoThisYear("2026-01-15", 400))).toBe("2026")
  })

  it("isDoneThisYear needs a Done status and a date in today's year", () => {
    expect(isDoneThisYear({ date: "2026-08-28", status: "done" }, "2026-10-07")).toBe(true)
    expect(isDoneThisYear({ date: "2025-12-31", status: "done" }, "2026-10-07")).toBe(false)
    expect(isDoneThisYear({ date: "2026-08-28", status: "active" }, "2026-10-07")).toBe(false)
    expect(isDoneThisYear({ date: null, status: "done" }, "2026-10-07")).toBe(false)
  })

  it("cadence-only and Done rows are not upcoming", () => {
    expect(isUpcomingIn({ date: null, status: "planned" }, TODAY, 30)).toBe(false)
    expect(isUpcomingIn({ date: addDays(TODAY, 10), status: "done" }, TODAY, 30)).toBe(false)
    expect(isUpcomingIn({ date: addDays(TODAY, 45), status: "planned" }, TODAY, 30)).toBe(false)
  })
})

describe("isInitiative / strip / normalize", () => {
  it("rejects a missing name, a bad type, an impossible date, and a row with neither date nor cadence", () => {
    expect(isInitiative(one)).toBe(true)
    expect(isInitiative({ ...one, name: "" })).toBe(false)
    expect(isInitiative({ ...one, name: "   " })).toBe(false)
    expect(isInitiative({ ...one, type: "webinar" })).toBe(false)
    expect(isInitiative({ ...one, status: "skipped" })).toBe(false)
    expect(isInitiative({ ...one, date: "2026-02-30" })).toBe(false)
    expect(isInitiative({ ...one, date: null, cadence: "" })).toBe(false)
    expect(isInitiative({ ...one, date: null, cadence: "Annual" })).toBe(true)
    expect(isInitiative({ ...one, impact: "x".repeat(INITIATIVE_LIMITS.impact + 1) })).toBe(false)
    expect(isInitiative({ ...one, id: "clinic-1" })).toBe(false)
  })

  it("stripInitiative drops unknown keys", () => {
    const dirty = { ...one, bogus: true } as Initiative & { bogus: boolean }
    const clean = stripInitiative(dirty)
    expect("bogus" in clean).toBe(false)
    expect(Object.keys(clean)).toEqual([
      "id",
      "name",
      "type",
      "partner",
      "date",
      "cadence",
      "status",
      "owner",
      "impact",
    ])
  })

  it("normalizeInput trims, clamps, blanks a bad date, and defaults a blank owner", () => {
    const n = normalizeInput(
      input({
        name: "  Gear drive  ",
        partner: "  Yates  ",
        date: "2026-13-45",
        cadence: "  Monthly  ",
        owner: "   ",
        impact: "  12 iPads  ",
      })
    )
    expect(n.name).toBe("Gear drive")
    expect(n.partner).toBe("Yates")
    expect(n.date).toBeNull()
    expect(n.cadence).toBe("Monthly")
    expect(n.owner).toBe(DEFAULT_OWNER)
    expect(n.impact).toBe("12 iPads")
    expect(n.name.length).toBeLessThanOrEqual(INITIATIVE_LIMITS.name)
  })

  it("sameInitiative is field-by-field", () => {
    const a: Initiative = { id: "initiative-1", ...input() }
    expect(sameInitiative(a, { ...a })).toBe(true)
    expect(sameInitiative(a, { ...a, status: "active" })).toBe(false)
    expect(sameInitiative(a, { ...a, impact: "changed" })).toBe(false)
  })
})

describe("filters, sort, describe", () => {
  it("matchesFilters and filterInitiatives narrow by type and status", () => {
    expect(filterInitiatives(seed, "volunteer", "all")).toHaveLength(3)
    expect(filterInitiatives(seed, "donation", "all")).toHaveLength(2)
    expect(filterInitiatives(seed, "all", "idea")).toHaveLength(2)
    expect(filterInitiatives(seed, "outreach", "idea")).toHaveLength(1)
    expect(matchesFilters(one, "all", "all")).toBe(true)
    expect(matchesFilters(one, "volunteer", "planned")).toBe(true)
    expect(matchesFilters(one, "donation", "planned")).toBe(false)
  })

  it("sorts Active then Planned then Idea then Done, dated soonest first", () => {
    const names = sortInitiatives(seed).map((r) => r.name)
    expect(names[0]).toBe("Saturday volunteer coaching at Alief rec")
    expect(names[1]).toBe("Equipment drive for Yates High School")
    expect(names.at(-1)).toBe("Refurbished iPads for a Title I program")
  })

  it("formatWhen and describeInitiative prefer a date, then a cadence", () => {
    const dated = formatWhen(one, TODAY)
    expect(dated.primary).toBe(formatDate(addDays(TODAY, 12)))
    expect(dated.relative).toBe(formatRelativeDay(addDays(TODAY, 12), TODAY))
    const idea = seed.find((r) => r.id === "initiative-3")!
    expect(formatWhen(idea, TODAY).primary).toBe("Annual, each spring")
    expect(describeInitiative(one)).toBe(`${one.name} · ${formatDate(one.date!)}`)
    expect(describeInitiative(idea)).toBe(`${idea.name} · Annual, each spring`)
  })
})
