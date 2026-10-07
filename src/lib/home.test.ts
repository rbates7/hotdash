import { afterEach, describe, expect, it, vi } from "vitest"

import {
  NEEDS_YOU_CAP,
  boardPreview,
  compactDollars,
  kpiTone,
  needsYou,
  pulseLabel,
  sparklinePoints,
} from "@/lib/home"
import { CENTRAL, now } from "@/lib/clock"
import {
  ACTIVE_KPI_SET,
  kpiSets,
  KPI_SET_TITLES,
  kpiStripTitle,
  kpis,
} from "@/lib/home-fixture"
import { activeSprint, daysUntil } from "@/lib/issues"
import { actors, buildIssues, buildSprints } from "@/lib/issues-fixture"
import { buildInbox } from "@/lib/workplace-fixture"
import type { InboxItem } from "@/lib/workplace-fixture"
import { FIXED_NOW } from "@/test/clock"

const NOW = FIXED_NOW
const issues = buildIssues(NOW)
const sprints = buildSprints(NOW)
const inbox = buildInbox(NOW)

describe("kpiTone", () => {
  it("reads growth as good and shrinkage as bad by default", () => {
    expect(kpiTone({ direction: "up" })).toBe("good")
    expect(kpiTone({ direction: "down" })).toBe("bad")
  })

  it("flips for lower-is-better metrics such as churn", () => {
    expect(kpiTone({ direction: "down", lowerIsBetter: true })).toBe("good")
    expect(kpiTone({ direction: "up", lowerIsBetter: true })).toBe("bad")
  })

  it("is flat when nothing moved", () => {
    expect(kpiTone({ direction: "flat" })).toBe("flat")
    expect(kpiTone({ direction: "flat", lowerIsBetter: true })).toBe("flat")
  })
})

describe("pulseLabel", () => {
  it("names the weekday in Central time", () => {
    // 03:00 UTC Thursday is still Wednesday evening in Chicago.
    expect(pulseLabel(new Date("2026-10-08T03:00:00Z"))).toBe("Wednesday pulse")
    expect(pulseLabel(new Date("2026-10-08T03:00:00Z"), "UTC")).toBe("Thursday pulse")
  })

})

describe("one real clock", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // A Wednesday night in Chicago (Thursday in UTC) and a Sunday in January.
  const instants = ["2026-10-08T03:00:00Z", "2027-01-17T18:30:00Z"]

  it("now() is the wall clock, not a frozen instant", () => {
    const before = Date.now()
    const t = now().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Date.now())

    vi.useFakeTimers({ now: new Date(instants[0]) })
    expect(now().toISOString()).toBe("2026-10-08T03:00:00.000Z")
  })

  it("the lede weekday is now() in America/Chicago", () => {
    for (const iso of instants) {
      vi.useFakeTimers({ now: new Date(iso) })
      const expected = now().toLocaleDateString("en-US", { weekday: "long", timeZone: CENTRAL })
      expect(pulseLabel(now())).toBe(`${expected} pulse`)
    }
    vi.useFakeTimers({ now: new Date(instants[0]) })
    expect(pulseLabel(now())).toBe("Wednesday pulse")
  })

  it("the sprint countdown equals daysUntil(sprint.end, now()) on any day", () => {
    for (const iso of instants) {
      vi.useFakeTimers({ now: new Date(iso) })
      const at = now()
      const freshSprints = buildSprints(at)
      const sprint = activeSprint(freshSprints)!
      const preview = boardPreview(buildIssues(at), freshSprints, actors, at)!
      expect(preview.daysLeft).toBe(daysUntil(sprint.endDate, at))
      expect(preview.daysLeft).toBe(9)
      expect(Date.parse(sprint.endDate)).toBeGreaterThan(at.getTime())
    }
  })

  it("a seed from an older day reads as overdue against today, not as fresh", () => {
    vi.useFakeTimers({ now: new Date(instants[1]) })
    const stale = buildSprints(new Date(instants[0]))
    const preview = boardPreview(buildIssues(now()), stale, actors, now())!
    expect(preview.daysLeft).toBe(daysUntil(activeSprint(stale)!.endDate, now()))
    expect(preview.daysLeft).toBeLessThan(0)
  })
})

describe("needsYou", () => {
  it("keeps the lit and informational rows but drops dismissed ones", () => {
    const result = needsYou(inbox, issues)
    expect(result.items.map((i) => i.id)).toEqual([
      "408-review",
      "412-blocked",
      "406-urgent",
    ])
    expect(result.waiting).toBe(2)
    expect(result.overflow).toBe(0)
  })

  it("drops a row once its ticket is done on the board", () => {
    const closed = issues.map((i) =>
      i.key === "CHLK-408" ? { ...i, status: "done" as const } : i
    )
    const result = needsYou(inbox, closed)
    expect(result.items.map((i) => i.id)).toEqual(["412-blocked", "406-urgent"])
    expect(result.waiting).toBe(1)
  })

  it("drops a row whose ticket no longer exists", () => {
    const without = issues.filter((i) => i.key !== "CHLK-412")
    expect(needsYou(inbox, without).items.map((i) => i.id)).toEqual([
      "408-review",
      "406-urgent",
    ])
  })

  it("is empty once everything is handled", () => {
    const allDone = issues.map((i) => ({ ...i, status: "done" as const }))
    expect(needsYou(inbox, allDone)).toEqual({ items: [], waiting: 0, overflow: 0 })
  })

  it("caps at five and reports the overflow, counting waiting before the cap", () => {
    const many: InboxItem[] = Array.from({ length: 8 }, (_, n) => ({
      id: `row-${n}`,
      title: `Row ${n}`,
      snippet: "",
      at: NOW.toISOString(),
      unread: n % 2 === 0,
    }))
    const result = needsYou(many, issues)
    expect(NEEDS_YOU_CAP).toBe(5)
    expect(result.items).toHaveLength(5)
    expect(result.overflow).toBe(3)
    expect(result.waiting).toBe(4)
  })
})

describe("boardPreview", () => {
  it("summarises the running sprint column by column", () => {
    const preview = boardPreview(issues, sprints, actors, NOW)
    expect(preview?.sprint.name).toBe("Sprint 4")
    expect(preview?.columns.map((c) => [c.label, c.count])).toEqual([
      ["To Do", 4],
      ["In Progress", 3],
      ["In Review", 3],
      ["Done", 4],
      ["Blocked", 2],
    ])
    expect(preview?.working).toBe(3)
    expect(preview?.progress).toEqual({ done: 4, total: 16, pct: 25 })
    expect(preview?.daysLeft).toBe(9)
  })

  it("ignores backlog issues outside the sprint", () => {
    const preview = boardPreview(issues, sprints, actors, NOW)
    const total = preview!.columns.reduce((sum, c) => sum + c.count, 0)
    expect(total).toBe(16)
    expect(issues.length).toBeGreaterThan(16)
  })

  it("is null when no sprint is running", () => {
    const completed = sprints.map((s) =>
      s.status === "active" ? { ...s, status: "completed" as const } : s
    )
    expect(boardPreview(issues, completed, actors, NOW)).toBeNull()
  })
})

describe("sparklinePoints", () => {
  it("spans the width and maps the range to the height", () => {
    expect(sparklinePoints([0, 10, 5], 100, 40, 0)).toBe("0,40 50,0 100,20")
  })

  it("keeps a flat series in the middle instead of on an edge", () => {
    expect(sparklinePoints([3, 3], 10, 10, 0)).toBe("0,5 10,5")
    expect(sparklinePoints([], 10, 10)).toBe("")
  })
})

describe("KPI card sets", () => {
  // The day the Metrics mock was drawn; the shared fixture reproduces it.
  const TODAY = "2026-08-21"
  const KPI_SETS = kpiSets(TODAY)

  it("ships the truth strip: subscribers (the Metrics Subscribers number) and cash this week", () => {
    expect(ACTIVE_KPI_SET).toBe("truth")
    expect(kpis(TODAY).map((k) => k.label)).toEqual(["Subscribers", "Cash this week"])
    expect(kpiStripTitle).toBe("Truth strip")
  })

  it("keeps the growth set ready to switch back to", () => {
    expect(KPI_SETS.growth.map((k) => k.label)).toEqual([
      "MRR",
      "ARR",
      "Subscribers",
      "Churn Rate",
    ])
    expect(KPI_SET_TITLES.growth).toBe("KPIs")
  })

  it("every card in every set is well-formed with a unique id", () => {
    for (const set of Object.values(KPI_SETS)) {
      const ids = set.map((k) => k.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const k of set) {
        expect(k.label).not.toBe("")
        expect(k.value).not.toBe("")
        expect(k.delta).not.toBe("")
        expect(["up", "down", "flat"]).toContain(k.direction)
        expect(["good", "bad", "flat"]).toContain(kpiTone(k))
      }
    }
  })
})

describe("compactDollars", () => {
  it("abbreviates thousands", () => {
    expect(compactDollars(21_840)).toBe("$21.8k")
    expect(compactDollars(26_000)).toBe("$26k")
    expect(compactDollars(950)).toBe("$950")
  })
})
