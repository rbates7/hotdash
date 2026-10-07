import { describe, expect, it } from "vitest"

import {
  BUG_LABEL,
  BUG_STATUS_ORDER,
  CRASH_LABEL,
  bugSource,
  bugs,
  crashCount,
  crashKpi,
  dailyCrashes,
  groupBugs,
  hasSeedBugs,
  isBug,
  openBugs,
  toggleLabel,
} from "@/lib/bugs"
import { addDays, todayIn } from "@/lib/clock"
import { STATUS_ORDER } from "@/lib/issues"
import { SEED_ISSUE_KEYS, YOYO, actors, buildIssues } from "@/lib/issues-fixture"
import { FIXED_NOW, LATE_EVENING_CT } from "@/test/clock"

const seed = () => buildIssues(FIXED_NOW)

describe("bug filter", () => {
  it("a bug is a Workplace ticket carrying the bug label — nothing else", () => {
    expect(isBug({ labels: ["editor", BUG_LABEL] })).toBe(true)
    expect(isBug({ labels: ["editor"] })).toBe(false)
    expect(isBug({ labels: [] })).toBe(false)
    // Case and whitespace are not forgiven: the label is a key, not prose.
    expect(isBug({ labels: ["Bug"] })).toBe(false)
  })

  it("the seed has a few bugs, coach-reported and crashes, owned by Yo-Yo", () => {
    const all = bugs(seed())
    expect(all.map((i) => i.key)).toEqual(["CHLK-404", "CHLK-419", "CHLK-420", "CHLK-421"])
    expect(all.map(bugSource)).toEqual(["coach", "crash", "coach", "crash"])
    expect(all.filter((i) => i.assigneeId === YOYO)).toHaveLength(3)
    expect(actors.find((a) => a.id === YOYO)).toMatchObject({ name: "Yo-Yo", kind: "human" })
  })

  it("source is Crash when the crash label is present, Coach-reported otherwise", () => {
    expect(bugSource({ labels: [BUG_LABEL, CRASH_LABEL] })).toBe("crash")
    expect(bugSource({ labels: [BUG_LABEL, "coach-reported"] })).toBe("coach")
    expect(bugSource({ labels: [BUG_LABEL] })).toBe("coach")
  })

  it("open bugs exclude Done", () => {
    const open = openBugs(seed())
    expect(open.map((i) => i.key)).toEqual(["CHLK-404", "CHLK-419", "CHLK-420"])
    expect(open.every((i) => i.status !== "done")).toBe(true)
  })

  it("the sample-data notice's gate is any listed seed bug", () => {
    expect(hasSeedBugs(seed())).toBe(true)
    expect(SEED_ISSUE_KEYS.has("CHLK-419")).toBe(true)
    const untagged = seed().map((i) =>
      i.labels.includes(BUG_LABEL) ? { ...i, labels: i.labels.filter((l) => l !== BUG_LABEL) } : i
    )
    const fresh = { ...seed()[0], key: "CHLK-999", labels: [BUG_LABEL] }
    expect(SEED_ISSUE_KEYS.has("CHLK-999")).toBe(false)
    expect(hasSeedBugs(untagged)).toBe(false)
    expect(hasSeedBugs([...untagged, fresh])).toBe(false)
    expect(bugs([...untagged, fresh]).map((i) => i.key)).toEqual(["CHLK-999"])
  })

  it("CHLK-419 does not invent a crash-report count that contradicts the card", () => {
    const issue = seed().find((i) => i.key === "CHLK-419")!
    expect(issue.description).not.toMatch(/\d+ crash reports/)
  })
})

describe("grouping by status", () => {
  it("uses the board's column order with Done last and drops empty groups", () => {
    expect(BUG_STATUS_ORDER).toEqual(["todo", "in_progress", "in_review", "blocked", "done"])
    expect(new Set(BUG_STATUS_ORDER)).toEqual(new Set(STATUS_ORDER))
    const groups = groupBugs(seed())
    expect(groups.map((g) => [g.status, g.bugs.map((b) => b.key)])).toEqual([
      ["todo", ["CHLK-419"]],
      ["in_progress", ["CHLK-404"]],
      ["in_review", ["CHLK-420"]],
      ["done", ["CHLK-421"]],
    ])
  })

  it("keeps key order inside a group so a bug keeps its place when edited", () => {
    const issues = seed().map((i) => (isBug(i) ? { ...i, status: "todo" as const } : i))
    expect(groupBugs(issues)).toEqual([
      { status: "todo", bugs: issues.filter(isBug) },
    ])
  })
})

describe("toggleLabel", () => {
  it("adds a missing label and removes a present one", () => {
    expect(toggleLabel(["editor"], BUG_LABEL)).toEqual(["editor", BUG_LABEL])
    expect(toggleLabel(["editor", BUG_LABEL], BUG_LABEL)).toEqual(["editor"])
  })

  it("never leaves a duplicate behind", () => {
    expect(toggleLabel([BUG_LABEL, "x", BUG_LABEL], BUG_LABEL)).toEqual(["x"])
    expect(toggleLabel(["x", "x"], BUG_LABEL)).toEqual(["x", BUG_LABEL])
  })

  it("does not touch the input", () => {
    const labels = ["editor"]
    toggleLabel(labels, BUG_LABEL)
    expect(labels).toEqual(["editor"])
  })
})

describe("crash count (sample)", () => {
  it("sums the trailing seven days against the seven before, today inclusive", () => {
    const today = todayIn(FIXED_NOW)
    const rows = dailyCrashes(today)
    expect(rows).toHaveLength(14)
    expect(rows[13].date).toBe(today)
    expect(rows[0].date).toBe(addDays(today, -13))
    const c = crashCount(today)
    expect(c.thisWeek).toEqual({ start: addDays(today, -6), end: today })
    expect(c.lastWeek).toEqual({ start: addDays(today, -13), end: addDays(today, -7) })
    expect(c.value).toBe(rows.slice(7).reduce((n, r) => n + r.count, 0))
    expect(c.previous).toBe(rows.slice(0, 7).reduce((n, r) => n + r.count, 0))
    expect(c.value).toBe(8)
    expect(c.previous).toBe(15)
  })

  it("is the same whatever day it is laid over", () => {
    expect(crashCount("2026-10-07").value).toBe(crashCount("2027-02-28").value)
    expect(crashCount("2026-10-07").previous).toBe(crashCount("2027-02-28").previous)
  })

  it("ends the week on the Central calendar day, so 23:30 CT is still the 7th", () => {
    // Both zones in CI: a machine-zone reading would say the 8th under UTC.
    const c = crashCount(LATE_EVENING_CT)
    expect(c.thisWeek.end).toBe("2026-10-07")
    expect(c.thisWeek.start).toBe("2026-10-01")
    expect(c.lastWeek).toEqual({ start: "2026-09-24", end: "2026-09-30" })
  })

  it("reads as a KPI where fewer crashes is the good direction", () => {
    const kpi = crashKpi(FIXED_NOW)
    expect(kpi).toMatchObject({
      label: "Crashes",
      value: "8",
      delta: "−7 vs previous 7 days",
      direction: "down",
      lowerIsBetter: true,
    })
  })
})
