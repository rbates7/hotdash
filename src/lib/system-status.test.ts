import { describe, expect, it } from "vitest"

import { formatDate, formatRelative, todayIn } from "@/lib/clock"
import {
  VERDICT_EMPTY,
  VERDICT_GREEN,
  VERDICT_NOT_GREEN,
  buildPastIncident,
  buildServices,
  countByStatus,
  formatCentralTime,
  formatChecked,
  formatCheckedAgo,
  formatCounts,
  formatDownCount,
  isScenario,
  joinNames,
  verdictFor,
  type Service,
} from "@/lib/system-status"
import { FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"

const svc = (over: Partial<Service> & Pick<Service, "id" | "status">): Service => ({
  name: over.id,
  reason: "because",
  checkedAtMs: FIXED_NOW_MS - 60_000,
  ...over,
})

describe("verdict", () => {
  it("is green only when every row is operational", () => {
    const v = verdictFor(buildServices(FIXED_NOW_MS, "green"))
    expect(v.green).toBe(true)
    expect(v.title).toBe(VERDICT_GREEN)
    expect(v.anyDown).toBe(false)
    expect(v.counts).toEqual({ operational: 7, degraded: 0, down: 0 })
    expect(v.detail).toBe("Every check passed. Nothing needs you.")
  })

  it("one degraded row makes the whole page not green (the mock's state)", () => {
    const v = verdictFor(buildServices(FIXED_NOW_MS, "not-green"))
    expect(v.green).toBe(false)
    expect(v.title).toBe(VERDICT_NOT_GREEN)
    expect(v.anyDown).toBe(false)
    expect(v.counts).toEqual({ operational: 6, degraded: 1, down: 0 })
    expect(v.detail).toBe("Billing is degraded · Stripe webhook delay. Other systems operational.")
  })

  it("any red makes it not green, however many rows are fine", () => {
    const rows = [
      ...buildServices(FIXED_NOW_MS, "green"),
      svc({ id: "db", name: "Database", status: "down", reason: "Connection refused" }),
    ]
    const v = verdictFor(rows)
    expect(v.green).toBe(false)
    expect(v.title).toBe(VERDICT_NOT_GREEN)
    expect(v.anyDown).toBe(true)
    expect(v.counts.down).toBe(1)
    expect(v.detail).toBe("Database is down · Connection refused. Other systems operational.")
  })

  it("names every red and amber row, red first, and drops the 'other systems' clause when nothing is fine", () => {
    const v = verdictFor([
      svc({ id: "a", name: "Auth", status: "degraded", reason: "Slow sign-ins" }),
      svc({ id: "b", name: "Sync", status: "down", reason: "Queue stuck" }),
      svc({ id: "c", name: "Export", status: "down", reason: "Timeouts" }),
    ])
    expect(v.green).toBe(false)
    expect(v.detail).toBe("Sync and Export are down · Queue stuck; Timeouts. Auth is degraded · Slow sign-ins.")
  })

  it("an empty list is a neutral state, not green-by-vacuity", () => {
    const v = verdictFor([])
    expect(v.green).toBe(false)
    expect(v.empty).toBe(true)
    expect(v.anyDown).toBe(false)
    expect(v.title).toBe(VERDICT_EMPTY)
    expect(v.detail).toBe("Nothing is connected. There are no checks to report.")
    expect(v.counts).toEqual({ operational: 0, degraded: 0, down: 0 })
    expect(Number.isNaN(v.updatedAtMs)).toBe(true)
  })

  it("'updated' is the most recent check across the rows", () => {
    const v = verdictFor(buildServices(FIXED_NOW_MS, "green"))
    expect(v.updatedAtMs).toBe(FIXED_NOW_MS - 2 * 60_000)
  })

  it("counts and their labels", () => {
    const green = countByStatus(buildServices(FIXED_NOW_MS, "green"))
    expect(formatCounts(green)).toBe("7 operational")
    expect(formatDownCount(green)).toBe("None down")
    const mixed = { operational: 5, degraded: 1, down: 1 }
    expect(formatCounts(mixed)).toBe("5 operational · 1 degraded · 1 down")
    expect(formatDownCount(mixed)).toBe("1 down")
    expect(formatDownCount({ operational: 0, degraded: 0, down: 2 })).toBe("2 down")
  })

  it("joins names the way a sentence would", () => {
    expect(joinNames([])).toBe("")
    expect(joinNames(["Billing"])).toBe("Billing")
    expect(joinNames(["Billing", "Sync"])).toBe("Billing and Sync")
    expect(joinNames(["Billing", "Sync", "Auth"])).toBe("Billing, Sync and Auth")
  })
})

describe("seed", () => {
  it("dates every check against the instant it is given, never the machine clock", () => {
    const rows = buildServices(FIXED_NOW_MS, "green")
    expect(rows.map((r) => r.name)).toEqual([
      "iPad app API",
      "Sync",
      "Auth",
      "Billing",
      "chlkapp.com",
      "Export",
      "Sentry errors (24h)",
    ])
    for (const r of rows) {
      expect(r.checkedAtMs).toBeLessThan(FIXED_NOW_MS)
      expect(r.reason.length).toBeGreaterThan(0)
    }
    const later = buildServices(FIXED_NOW_MS + 3_600_000, "green")
    expect(later[0].checkedAtMs - rows[0].checkedAtMs).toBe(3_600_000)
  })

  it("the two scenarios differ only in the Billing row", () => {
    const green = buildServices(FIXED_NOW_MS, "green")
    const notGreen = buildServices(FIXED_NOW_MS, "not-green")
    expect(green.filter((r) => r.id !== "billing")).toEqual(notGreen.filter((r) => r.id !== "billing"))
    expect(notGreen.find((r) => r.id === "billing")).toMatchObject({ status: "degraded", reason: "Stripe webhook delay" })
  })

  it("links out to Sentry and the site as plain hrefs", () => {
    const rows = buildServices(FIXED_NOW_MS)
    expect(rows.find((r) => r.id === "site")?.href).toBe("https://chlkapp.com")
    expect(rows.find((r) => r.id === "sentry")?.href).toMatch(/sentry\.io$/)
  })

  it("the past incident is 50 days before the Central day of the instant", () => {
    // 27 Aug 2026 09:00 Chicago → 8 Jul 2026.
    expect(buildPastIncident(FIXED_NOW_MS).day).toBe("2026-07-08")
    expect(formatDate(buildPastIncident(FIXED_NOW_MS).day)).toBe("8 Jul 2026")
  })

  it("only knows the seeded scenarios", () => {
    expect(isScenario("green")).toBe(true)
    expect(isScenario("not-green")).toBe(true)
    expect(isScenario("empty")).toBe(true)
    expect(isScenario("red")).toBe(false)
    expect(isScenario(undefined)).toBe(false)
    expect(isScenario(["green"])).toBe(false)
  })
})

describe("check times use the shared relative formatter", () => {
  it("pins the verbose long style, which is no longer the default", () => {
    // Round 5 made `ago` ("5m ago") the default. This page keeps asking for
    // `long` so the health copy stays "2 min ago" / "3 h ago". These literals
    // are the contract — if the default or the long words move, this fails.
    const twoMin = FIXED_NOW_MS - 2 * 60_000
    const threeHr = FIXED_NOW_MS - 3 * 3_600_000
    expect(formatRelative(twoMin, FIXED_NOW_MS, { style: "long" })).toBe("2 min ago")
    expect(formatRelative(FIXED_NOW_MS, FIXED_NOW_MS, { style: "long" })).toBe("just now")
    expect(formatRelative(threeHr, FIXED_NOW_MS, { style: "long" })).toBe("3 h ago")
    expect(formatRelative(twoMin, FIXED_NOW_MS)).toBe("2m ago") // default is now `ago`
    expect(formatCheckedAgo(twoMin, FIXED_NOW_MS)).toBe("2 min ago")
    expect(formatChecked(twoMin, FIXED_NOW_MS)).toBe("Checked 2 min ago · 8:58 AM CT")
    expect(formatChecked(FIXED_NOW_MS, FIXED_NOW_MS)).toBe("Checked just now · 9:00 AM CT")
    expect(formatChecked(threeHr, FIXED_NOW_MS)).toBe("Checked 3 h ago · 6:00 AM CT")
    // A check "in the future" (clock skew) reads as the freshest bucket, never negative.
    expect(formatCheckedAgo(FIXED_NOW_MS + 90_000, FIXED_NOW_MS)).toBe("just now")
    expect(formatCheckedAgo(FIXED_NOW_MS + 90_000, FIXED_NOW_MS)).not.toMatch(/-/)
  })
})

/**
 * The late-evening matrix. 23:30 Central is already the next calendar day
 * in UTC, so a formatter that leaned on the machine zone would print the
 * wrong day (or hour) under `pnpm test` and the right one under
 * `pnpm test:tz`. Both runs must agree with these literals. The shared
 * `LATE_EVENING_CT` is the daylight-time case (CDT, UTC−5); the second
 * case is the same wall-clock time in standard time (CST, UTC−6).
 */
describe("23:30 Central, in both halves of the year, whatever TZ the process runs in", () => {
  const cases = [
    { label: "CDT (LATE_EVENING_CT)", nowMs: LATE_EVENING_CT_MS, centralDay: "2026-10-07", incidentDay: "2026-08-18" },
    { label: "CST", nowMs: Date.parse("2026-01-16T05:30:00.000Z"), centralDay: "2026-01-15", incidentDay: "2025-11-26" },
  ] as const

  it.each(cases)("$label: the Central day, clock time and incident date hold", ({ nowMs, centralDay, incidentDay }) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(tz).toMatch(/^(UTC|America\/Chicago)$/)

    // The machine's day is already tomorrow under UTC; Central's is not.
    expect(todayIn(new Date(nowMs))).toBe(centralDay)
    if (tz === "UTC") expect(new Date(nowMs).getDate()).not.toBe(Number(centralDay.slice(-2)))

    // The clock reads Central regardless of the process zone.
    expect(formatCentralTime(nowMs)).toBe("11:30 PM CT")
    expect(formatCentralTime(nowMs - 2 * 60_000)).toBe("11:28 PM CT")
    expect(formatChecked(nowMs - 2 * 60_000, nowMs)).toBe(`Checked ${formatCheckedAgo(nowMs - 2 * 60_000, nowMs)} · 11:28 PM CT`)

    // Rows and the incident are dated from the instant, on the Central calendar.
    const rows = buildServices(nowMs, "green")
    expect(rows.every((r) => formatCentralTime(r.checkedAtMs).endsWith("PM CT"))).toBe(true)
    expect(buildPastIncident(nowMs).day).toBe(incidentDay)

    // And the verdict's "updated" reads from the same instant.
    expect(formatCheckedAgo(verdictFor(rows).updatedAtMs, nowMs)).toBe(formatCheckedAgo(nowMs - 2 * 60_000, nowMs))
  })

  it("the Central clock crosses midnight exactly where Chicago does", () => {
    // 23:59 CDT → "11:59 PM CT"; a minute later it is 12:00 AM and the next Central day.
    const beforeMidnight = LATE_EVENING_CT_MS + 29.5 * 60_000
    expect(formatCentralTime(beforeMidnight)).toBe("11:59 PM CT")
    expect(todayIn(new Date(beforeMidnight))).toBe("2026-10-07")
    const afterMidnight = beforeMidnight + 60_000
    expect(formatCentralTime(afterMidnight)).toBe("12:00 AM CT")
    expect(todayIn(new Date(afterMidnight))).toBe("2026-10-08")
  })
})
