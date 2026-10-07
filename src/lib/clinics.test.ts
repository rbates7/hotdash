import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CLINICS_MOCK_DAY,
  CLINIC_LIMITS,
  DEFAULT_OWNER,
  EMPTY_COLLECTED,
  SEED_CLINIC_IDS,
  clinicNumber,
  describeClinic,
  formatCollected,
  isClinic,
  isCollected,
  isSeedClinic,
  isUpcoming,
  normalizeInput,
  relativeDay,
  sameClinic,
  seedClinics,
  splitClinics,
  statusOf,
  stripClinic,
  type Clinic,
} from "@/lib/clinics"
import { daysBetween, formatDate, now, todayIn } from "@/lib/clock"
import { LATE_EVENING_CT } from "@/test/clock"

afterEach(() => vi.useRealTimers())

const seed = seedClinics(CLINICS_MOCK_DAY)
const one = seed[0]

describe("seed", () => {
  it("reproduces the mock on the day it was drawn: four upcoming, four past, in the mock's order", () => {
    const { upcoming, past } = splitClinics(seed, CLINICS_MOCK_DAY)
    expect(upcoming.map((c) => [c.name, formatDate(c.date), c.city])).toEqual([
      ["Houston Offensive Staff Clinic", "12 Sep 2026", "Houston"],
      ["Dallas 7-on-7 Coaches Night", "19 Sep 2026", "Dallas"],
      ["Midweek CHLK walkthrough", "24 Sep 2026", "Remote"],
      ["Austin staff install", "3 Oct 2026", "Austin"],
    ])
    expect(past.map((c) => [c.name, formatDate(c.date), c.city])).toEqual([
      ["Spring Houston walk-through", "8 Jun 2026", "Houston"],
      ["Dallas staff huddle", "22 May 2026", "Dallas"],
      ["Remote playbook office hours", "14 May 2026", "Remote"],
      ["Fort Worth spring clinic", "29 Apr 2026", "Fort Worth"],
    ])
    expect(upcoming.map((c) => statusOf(c, CLINICS_MOCK_DAY))).toEqual(Array(4).fill("upcoming"))
    expect(past.map((c) => statusOf(c, CLINICS_MOCK_DAY))).toEqual(Array(4).fill("done"))
  })

  it("keeps the same split relative to any other day", () => {
    for (const day of ["2026-10-07", "2025-12-31", "2027-03-14"]) {
      const { upcoming, past } = splitClinics(seedClinics(day), day)
      expect(upcoming).toHaveLength(4)
      expect(past).toHaveLength(4)
      expect(upcoming.every((c) => c.date > day)).toBe(true)
      expect(past.every((c) => c.date < day)).toBe(true)
    }
  })

  it("every seed row passes its own guard, is owned by Trip and has a unique clinic-n id", () => {
    expect(seed.every(isClinic)).toBe(true)
    expect(seed.every((c) => c.owner === DEFAULT_OWNER)).toBe(true)
    expect(new Set(seed.map((c) => c.id)).size).toBe(8)
    expect([...SEED_CLINIC_IDS]).toEqual(seed.map((c) => c.id))
    expect(isSeedClinic({ id: "clinic-3" })).toBe(true)
    expect(isSeedClinic({ id: "clinic-9" })).toBe(false)
    expect(clinicNumber("clinic-12")).toBe(12)
    expect(clinicNumber("exp-12")).toBe(0)
  })

  it("past seed rows have something collected; upcoming ones nothing yet", () => {
    const { upcoming, past } = splitClinics(seed, CLINICS_MOCK_DAY)
    expect(upcoming.every((c) => formatCollected(c.collected) === null)).toBe(true)
    expect(past.every((c) => formatCollected(c.collected) !== null)).toBe(true)
  })
})

describe("Upcoming vs Past is decided on Central calendar days", () => {
  /** 23:30 Central on 7 Oct 2026 (CDT, UTC−5): UTC already reads 8 Oct. */
  const LATE_CDT = LATE_EVENING_CT
  /** 23:30 Central on 31 Oct 2026, the last evening of daylight time. */
  const LATE_DST_EVE = new Date("2026-11-01T04:30:00.000Z")
  /** 23:30 Central on 1 Nov 2026 (CST, UTC−6), the first evening of standard time. */
  const LATE_CST = new Date("2026-11-02T05:30:00.000Z")
  /** 23:30 Central on 31 Dec 2025 (CST): UTC is already 2026. */
  const LATE_NYE = new Date("2026-01-01T05:30:00.000Z")

  const at = (date: string): Pick<Clinic, "date" | "attendance"> => ({ date, attendance: "planned" })

  it("a clinic dated today is still Upcoming at 23:30 CT, though UTC has moved on", () => {
    vi.useFakeTimers({ now: LATE_CDT })
    const today = todayIn(now())
    expect(today).toBe("2026-10-07")
    // The naive machine-zone reading would say the 8th and file today's clinic under Past.
    expect(now().getUTCDate()).toBe(8)
    expect(isUpcoming(at("2026-10-07"), today)).toBe(true)
    expect(statusOf(at("2026-10-07"), today)).toBe("upcoming")
    expect(relativeDay("2026-10-07", today)).toBe("Today")
    expect(isUpcoming(at("2026-10-06"), today)).toBe(false)
    expect(statusOf(at("2026-10-06"), today)).toBe("unconfirmed")
    expect(relativeDay("2026-10-06", today)).toBe("Yesterday")
    expect(relativeDay("2026-10-08", today)).toBe("Tomorrow")
  })

  it("crossing the DST change is one calendar day, not 25 hours rounded somewhere", () => {
    vi.useFakeTimers({ now: LATE_DST_EVE })
    const today = todayIn(now())
    expect(today).toBe("2026-10-31")
    expect(relativeDay("2026-11-01", today)).toBe("Tomorrow")
    expect(relativeDay("2026-11-07", today)).toBe("in 7 days")
    expect(daysBetween(today, "2026-11-01")).toBe(1)

    vi.setSystemTime(LATE_CST)
    const next = todayIn(now())
    expect(next).toBe("2026-11-01")
    expect(relativeDay("2026-10-31", next)).toBe("Yesterday")
    expect(statusOf(at("2026-10-31"), next)).toBe("unconfirmed")
    expect(isUpcoming(at("2026-11-01"), next)).toBe(true)
  })

  it("23:30 CT on New Year's Eve stays in the old year", () => {
    vi.useFakeTimers({ now: LATE_NYE })
    const today = todayIn(now())
    expect(today).toBe("2025-12-31")
    expect(statusOf(at("2025-12-31"), today)).toBe("upcoming")
    expect(relativeDay("2026-01-01", today)).toBe("Tomorrow")
  })

  it("the seed built from a late-evening instant splits around the Central day, same under any TZ", () => {
    const today = todayIn(LATE_CDT)
    const { upcoming, past } = splitClinics(seedClinics(today), today)
    expect(upcoming).toHaveLength(4)
    expect(past).toHaveLength(4)
    expect(upcoming[0].date).toBe("2026-10-22")
    expect(relativeDay(upcoming[0].date, today)).toBe("in 15 days")
    expect(past[0].date).toBe("2026-07-18")
    expect(relativeDay(past[0].date, today)).toBe("81 days ago")
  })
})

describe("statusOf", () => {
  const today = "2026-10-07"
  it("Upcoming regardless of plan; past rows say what happened, or that nobody said", () => {
    expect(statusOf({ date: "2026-10-09", attendance: "skipped" }, today)).toBe("upcoming")
    expect(statusOf({ date: "2026-10-01", attendance: "attended" }, today)).toBe("done")
    expect(statusOf({ date: "2026-10-01", attendance: "skipped" }, today)).toBe("skipped")
    expect(statusOf({ date: "2026-10-01", attendance: "planned" }, today)).toBe("unconfirmed")
  })
})

describe("splitClinics ordering", () => {
  it("Upcoming soonest first, Past most recent first, same day by id", () => {
    const today = "2026-10-07"
    const mk = (id: number, date: string): Clinic => ({ ...one, id: `clinic-${id}`, date })
    const rows = [mk(5, "2026-10-20"), mk(2, "2026-10-07"), mk(9, "2026-10-07"), mk(1, "2026-09-01"), mk(7, "2026-10-01")]
    const { upcoming, past } = splitClinics(rows, today)
    expect(upcoming.map((c) => c.id)).toEqual(["clinic-2", "clinic-9", "clinic-5"])
    expect(past.map((c) => c.id)).toEqual(["clinic-7", "clinic-1"])
  })
})

describe("formatting", () => {
  it("collected reads as a dotted list, singulars included, or nothing", () => {
    expect(formatCollected({ leads: 12, emails: 9, demos: 2 })).toBe("12 leads · 9 emails · 2 demos")
    expect(formatCollected({ leads: 1, emails: 0, demos: 1 })).toBe("1 lead · 1 demo")
    expect(formatCollected(EMPTY_COLLECTED)).toBeNull()
  })

  it("describes a row by name and date", () => {
    expect(describeClinic(one)).toBe("Houston Offensive Staff Clinic · 12 Sep 2026")
  })
})

describe("guards", () => {
  const bad: [string, unknown][] = [
    ["not an object", "nope"],
    ["an array", []],
    ["id not clinic-n", { ...one, id: "exp-1" }],
    ["empty name", { ...one, name: "   " }],
    ["name over the cap", { ...one, name: "x".repeat(CLINIC_LIMITS.name + 1) }],
    ["impossible date", { ...one, date: "2026-13-45" }],
    ["non-canonical date", { ...one, date: "2026-9-1" }],
    ["date with a time", { ...one, date: "2026-09-12T00:00:00Z" }],
    ["unknown type", { ...one, type: "webinar" }],
    ["unknown attendance", { ...one, attendance: "maybe" }],
    ["collected missing a key", { ...one, collected: { leads: 1, emails: 1 } }],
    ["negative count", { ...one, collected: { ...one.collected, leads: -1 } }],
    ["fractional count", { ...one, collected: { ...one.collected, demos: 1.5 } }],
    ["count over the cap", { ...one, collected: { ...one.collected, emails: CLINIC_LIMITS.collected + 1 } }],
    ["collected as an array", { ...one, collected: [1, 2, 3] }],
    ["host over the cap", { ...one, host: "h".repeat(CLINIC_LIMITS.host + 1) }],
    ["city over the cap", { ...one, city: "c".repeat(CLINIC_LIMITS.city + 1) }],
    ["owner over the cap", { ...one, owner: "o".repeat(CLINIC_LIMITS.owner + 1) }],
    ["notes over the cap", { ...one, notes: "n".repeat(CLINIC_LIMITS.notes + 1) }],
    ["owner not a string", { ...one, owner: 7 }],
  ]
  it.each(bad)("rejects %s", (_name, value) => {
    expect(isClinic(value)).toBe(false)
  })

  it("accepts the seed, an empty host and notes, and counts at the cap", () => {
    expect(isClinic(one)).toBe(true)
    expect(isClinic({ ...one, host: "", notes: "", city: "" })).toBe(true)
    expect(isCollected({ leads: CLINIC_LIMITS.collected, emails: 0, demos: 0 })).toBe(true)
  })

  it("stripClinic keeps only the known keys, nested too", () => {
    const dirty = { ...one, extra: 1, collected: { ...one.collected, bonus: 9 } } as unknown as Clinic
    const clean = stripClinic(dirty)
    expect(Object.keys(clean).sort()).toEqual(
      ["attendance", "city", "collected", "date", "host", "id", "name", "notes", "owner", "type"]
    )
    expect(Object.keys(clean.collected).sort()).toEqual(["demos", "emails", "leads"])
    expect(isClinic(clean)).toBe(true)
  })
})

describe("normalizeInput", () => {
  it("trims, clamps to the caps, rounds counts into range and defaults the owner", () => {
    const n = normalizeInput({
      name: `  ${"n".repeat(CLINIC_LIMITS.name + 5)}  `,
      date: "2026-10-09",
      host: " Host ",
      city: " Katy ",
      type: "zoom",
      attendance: "planned",
      collected: { leads: 3.6, emails: -4, demos: Number.NaN },
      owner: "   ",
      notes: "x".repeat(CLINIC_LIMITS.notes + 1),
    })
    expect(n.name).toHaveLength(CLINIC_LIMITS.name)
    expect(n.host).toBe("Host")
    expect(n.city).toBe("Katy")
    expect(n.collected).toEqual({ leads: 4, emails: 0, demos: 0 })
    expect(n.owner).toBe(DEFAULT_OWNER)
    expect(n.notes).toHaveLength(CLINIC_LIMITS.notes)
    expect(isClinic({ id: "clinic-9", ...n })).toBe(true)
    expect(normalizeInput({ ...n, collected: { leads: 1e9, emails: 0, demos: 0 } }).collected.leads).toBe(
      CLINIC_LIMITS.collected
    )
  })

  it("sameClinic compares every field", () => {
    expect(sameClinic(one, { ...one })).toBe(true)
    expect(sameClinic(one, { ...one, notes: "changed" })).toBe(false)
    expect(sameClinic(one, { ...one, collected: { ...one.collected, demos: 1 } })).toBe(false)
  })
})
