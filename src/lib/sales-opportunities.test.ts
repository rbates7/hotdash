import { describe, expect, it } from "vitest"

import { todayIn } from "@/lib/clock"
import {
  CAPS,
  DEAL_FILTERS,
  SEED_DEAL_IDS,
  STAGES,
  countByFilter,
  dealsAreConsistent,
  describeDue,
  describeLastTouch,
  formatCentralDateTime,
  highestDealId,
  isDeal,
  isOverdue,
  matchesDealFilter,
  seedDeals,
  sortDeals,
  stripDeal,
  type Deal,
} from "@/lib/sales-opportunities"
import { FIXED_NOW_MS } from "@/test/clock"

const seed = seedDeals(FIXED_NOW_MS)
const TODAY = todayIn(new Date(FIXED_NOW_MS)) // 2026-08-27
const byId = (id: string) => seed.find((d) => d.id === id)!

describe("seed", () => {
  it("is eight invented deals, all marked sample, ids deal-1 … deal-8", () => {
    expect(seed).toHaveLength(8)
    expect(seed.map((d) => d.id)).toEqual([...SEED_DEAL_IDS])
    expect(seed.every((d) => d.sample)).toBe(true)
    expect(highestDealId(seed)).toBe(8)
    expect(seed.every(isDeal)).toBe(true)
    expect(dealsAreConsistent(seed, 9)).toBe(true)
  })

  it("has a D2 staff, an FCS staff, high-school programs and a clinic host", () => {
    const orgs = seed.map((d) => d.org).join(" | ")
    expect(orgs).toMatch(/\(D2\)/)
    expect(orgs).toMatch(/\(FCS\)/)
    expect(orgs).toMatch(/HS/)
    expect(orgs).toMatch(/Clinic \(host\)/)
    expect(seed.map((d) => d.what)).toContain("Clinic package")
  })

  it("dates due steps against today in Central and touches on whole Central days back", () => {
    expect(TODAY).toBe("2026-08-27")
    expect(byId("deal-1").nextStepDue).toBe("2026-08-29") // +2
    expect(byId("deal-3").nextStepDue).toBe("2026-08-25") // −2, overdue
    expect(byId("deal-5").nextStepDue).toBe("2026-08-26") // −1, overdue
    expect(byId("deal-6").nextStepDue).toBeNull()
    expect(describeLastTouch(byId("deal-2").lastTouch, TODAY)).toBe("3 days ago")
    expect(describeLastTouch(byId("deal-1").lastTouch, TODAY)).toBe("yesterday")
    expect(describeLastTouch(byId("deal-7").lastTouch, TODAY)).toBe("today")
    expect(byId("deal-7").lastTouch).toBe(new Date(FIXED_NOW_MS).toISOString())
  })

  it("hides exactly two closed deals from the Open view, one won and one lost", () => {
    expect(countByFilter(seed)).toEqual({ open: 6, won: 1, lost: 1, all: 8 })
    expect(byId("deal-7").stage).toBe("closed-won")
    expect(byId("deal-8").stage).toBe("closed-lost")
  })

  it("every seed string is inside its cap", () => {
    for (const d of seed) {
      expect(d.who.length).toBeLessThanOrEqual(CAPS.who)
      expect(d.org.length).toBeLessThanOrEqual(CAPS.org)
      expect(d.what.length).toBeLessThanOrEqual(CAPS.what)
      expect(d.nextStep.length).toBeLessThanOrEqual(CAPS.nextStep)
      if (d.value !== null) expect(d.value).toBeLessThanOrEqual(CAPS.value)
    }
  })
})

describe("Central day math at the edges (run under TZ=UTC and TZ=America/Chicago)", () => {
  // 23:30 CT on 7 Oct 2026 (CDT, UTC−5): already 04:30 on the 8th in UTC.
  const LATE = Date.parse("2026-10-08T04:30:00.000Z")

  it("a seed built at 23:30 CT is dated the 7th, and its touches count Central days", () => {
    const late = seedDeals(LATE)
    const today = todayIn(new Date(LATE))
    expect(today).toBe("2026-10-07")
    expect(late.find((d) => d.id === "deal-1")!.nextStepDue).toBe("2026-10-09")
    expect(late.find((d) => d.id === "deal-3")!.nextStepDue).toBe("2026-10-05")
    expect(describeLastTouch(late.find((d) => d.id === "deal-2")!.lastTouch, today)).toBe("3 days ago")
    expect(describeLastTouch(late.find((d) => d.id === "deal-1")!.lastTouch, today)).toBe("yesterday")
    expect(describeLastTouch(late.find((d) => d.id === "deal-7")!.lastTouch, today)).toBe("today")
    // The naive reading (UTC getters) says "deal-7 was touched tomorrow"; ours does not.
    expect(new Date(late.find((d) => d.id === "deal-7")!.lastTouch).getUTCDate()).toBe(8)
  })

  it("a touch at 23:30 CT read the next Central morning is yesterday, not two hours ago", () => {
    expect(describeLastTouch("2026-10-08T04:30:00.000Z", "2026-10-08")).toBe("yesterday")
    expect(describeLastTouch("2026-10-08T04:30:00.000Z", "2026-10-07")).toBe("today")
    // 23:30 CT on New Year's Eve (CST, UTC−6) stays in the old year.
    expect(describeLastTouch("2026-01-01T05:30:00.000Z", "2026-01-01")).toBe("yesterday")
    expect(describeLastTouch("2026-01-01T05:30:00.000Z", "2025-12-31")).toBe("today")
  })

  it("a due date is overdue only once the Central day has passed", () => {
    const deal = { nextStepDue: "2026-10-07", stage: "talking" } as const
    expect(isOverdue(deal, "2026-10-07")).toBe(false)
    expect(describeDue(deal, "2026-10-07")).toEqual({ date: "7 Oct 2026", relative: "Due today", overdue: false })
    expect(isOverdue(deal, "2026-10-08")).toBe(true)
    expect(describeDue(deal, "2026-10-08")).toEqual({ date: "7 Oct 2026", relative: "Overdue 1 day", overdue: true })
    expect(describeDue(deal, "2026-10-10")!.relative).toBe("Overdue 3 days")
    expect(describeDue(deal, "2026-10-06")!.relative).toBe("Due tomorrow")
    expect(describeDue(deal, "2026-10-01")!.relative).toBe("Due in 6 days")
    expect(describeDue({ nextStepDue: null }, "2026-10-01")).toBeNull()
  })

  it("a closed deal is never flagged overdue", () => {
    expect(isOverdue({ nextStepDue: "2026-10-01", stage: "closed-won" }, "2026-10-08")).toBe(false)
    expect(isOverdue({ nextStepDue: "2026-10-01", stage: "closed-lost" }, "2026-10-08")).toBe(false)
    expect(isOverdue({ nextStepDue: "2026-10-01", stage: "verbal" }, "2026-10-08")).toBe(true)
  })

  it("touches land on calendar days, so a DST change does not steal a day", () => {
    // 00:30 CST on 2 Nov 2026, the night after fall-back. `now − 3×24h`
    // would read 23:30 CDT on 29 Oct, i.e. four Central days back.
    const afterFallBack = Date.parse("2026-11-02T06:30:00.000Z")
    const today = todayIn(new Date(afterFallBack))
    expect(today).toBe("2026-11-02")
    const deals = seedDeals(afterFallBack)
    expect(describeLastTouch(deals.find((d) => d.id === "deal-2")!.lastTouch, today)).toBe("3 days ago")
    expect(todayIn(new Date(deals.find((d) => d.id === "deal-2")!.lastTouch))).toBe("2026-10-30")
  })

  it("the long form is day-first, Central, with CT spelled out", () => {
    expect(formatCentralDateTime("2026-10-08T04:30:00.000Z")).toBe("7 Oct 2026, 11:30 PM CT")
    expect(formatCentralDateTime("2026-01-01T05:30:00.000Z")).toBe("31 Dec 2025, 11:30 PM CT")
    expect(formatCentralDateTime(new Date(FIXED_NOW_MS))).toBe("27 Aug 2026, 9:00 AM CT")
    expect(formatCentralDateTime("garbage")).toBe("garbage")
  })
})

describe("filter", () => {
  it("Open hides both closed stages; Won and Lost pick one each; All is everything", () => {
    for (const d of seed) {
      expect(matchesDealFilter(d, "all")).toBe(true)
      expect(matchesDealFilter(d, "open")).toBe(!d.stage.startsWith("closed"))
      expect(matchesDealFilter(d, "won")).toBe(d.stage === "closed-won")
      expect(matchesDealFilter(d, "lost")).toBe(d.stage === "closed-lost")
    }
    expect(DEAL_FILTERS).toEqual(["open", "won", "lost", "all"])
  })
})

describe("sort", () => {
  it("defaults to soonest next step first, undated last, ties by id", () => {
    const ids = sortDeals(seed).map((d) => d.id)
    expect(ids).toEqual(["deal-3", "deal-5", "deal-7", "deal-1", "deal-2", "deal-4", "deal-6", "deal-8"])
  })

  it("keeps undated rows last in either direction", () => {
    const desc = sortDeals(seed, { key: "nextStepDue", dir: "desc" }).map((d) => d.id)
    expect(desc.slice(-2)).toEqual(["deal-6", "deal-8"])
    expect(desc[0]).toBe("deal-4")
  })

  it("values sort numerically with unknown last; stages follow the pipeline", () => {
    const values = sortDeals(seed, { key: "value", dir: "desc" })
    expect(values[0].value).toBe(12_000)
    expect(values.at(-1)!.value).toBeNull()
    const asc = sortDeals(seed, { key: "value", dir: "asc" })
    expect(asc[0].value).toBe(897)
    expect(asc.at(-1)!.value).toBeNull()
    const stages = sortDeals(seed, { key: "stage", dir: "asc" }).map((d) => d.stage)
    const order = stages.map((s) => STAGES.indexOf(s))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it("text columns compare case-insensitively and last touch chronologically", () => {
    const who = sortDeals(seed, { key: "who", dir: "asc" }).map((d) => d.who)
    expect(who[0]).toBe("Coach Aaron Fitch")
    expect(who.at(-1)).toBe("Dana Alvarez")
    const touch = sortDeals(seed, { key: "lastTouch", dir: "desc" })
    expect(touch[0].id).toBe("deal-7")
    expect(touch.at(-1)!.id).toBe("deal-8")
  })

  it("does not mutate its input", () => {
    const before = seed.map((d) => d.id)
    sortDeals(seed, { key: "who", dir: "desc" })
    expect(seed.map((d) => d.id)).toEqual(before)
  })
})

describe("isDeal", () => {
  const good = byId("deal-1")
  const cases: [string, unknown][] = [
    ["not an object", "deal"],
    ["an array", []],
    ["bad id format", { ...good, id: "exp-1" }],
    ["empty who", { ...good, who: "   " }],
    ["who over the cap", { ...good, who: "x".repeat(CAPS.who + 1) }],
    ["org over the cap", { ...good, org: "x".repeat(CAPS.org + 1) }],
    ["what over the cap", { ...good, what: "x".repeat(CAPS.what + 1) }],
    ["next step over the cap", { ...good, nextStep: "x".repeat(CAPS.nextStep + 1) }],
    ["negative value", { ...good, value: -1 }],
    ["fractional value", { ...good, value: 12.5 }],
    ["value over the cap", { ...good, value: CAPS.value + 1 }],
    ["value as a string", { ...good, value: "3840" }],
    ["unknown stage", { ...good, stage: "Proposal" }],
    ["unknown owner", { ...good, owner: "Mack" }],
    ["impossible due date", { ...good, nextStepDue: "2026-13-45" }],
    ["non-canonical due date", { ...good, nextStepDue: "2026-8-3" }],
    ["due date with a time", { ...good, nextStepDue: "2026-08-03T00:00:00Z" }],
    ["last touch that does not round-trip", { ...good, lastTouch: "2026-08-27T14:00:00Z" }],
    ["created at as a day", { ...good, createdAt: "2026-08-27" }],
    ["updated at garbage", { ...good, updatedAt: "yesterday" }],
    ["sample missing", (() => { const { sample: _s, ...rest } = good; void _s; return rest })()],
  ]

  it.each(cases)("rejects %s", (_name, value) => {
    expect(isDeal(value)).toBe(false)
  })

  it("accepts a null value and a null due date", () => {
    expect(isDeal({ ...good, value: null, nextStepDue: null })).toBe(true)
  })

  it("tolerates unknown keys, which stripDeal then removes", () => {
    const extra = { ...good, hunt: "FCS list", score: 7 } as unknown as Deal
    expect(isDeal(extra)).toBe(true)
    const stripped = stripDeal(extra)
    expect(stripped).toEqual(good)
    expect("hunt" in stripped).toBe(false)
  })

  it("dealsAreConsistent wants unique ids and a counter above the highest", () => {
    expect(dealsAreConsistent([good, good], 9)).toBe(false)
    expect(dealsAreConsistent(seed, 8)).toBe(false)
    expect(dealsAreConsistent(seed, 9.5)).toBe(false)
    expect(dealsAreConsistent(seed, 9)).toBe(true)
    expect(dealsAreConsistent([], 1)).toBe(true)
    expect(dealsAreConsistent([], 0)).toBe(false)
  })
})
