import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { FIXTURE_SUBJECTS, crmFixtureAccounts, crmFixtureCases } from "@/test/crm-fixture"
import {
  NO_FILTERS,
  ageLabel,
  clearFilters,
  filterAccounts,
  filterCases,
  hasFilters,
  isOverdue,
  oldestWaitingOnUs,
  parseCaseFilters,
  withFilters,
  withOpenCase,
} from "@/lib/crm/selectors"

const CASES = crmFixtureCases(FIXED_NOW_MS)
const subjects = (xs: { subject: string }[]) => xs.map((c) => c.subject)

describe("Cases filters in the URL", () => {
  it("reads every filter and ignores unknown values", () => {
    expect(parseCaseFilters(new URLSearchParams("q=login&status=closed&priority=urgent&waiting=1"))).toEqual({
      q: "login",
      status: "closed",
      priority: "urgent",
      waitingOnUs: true,
    })
    expect(parseCaseFilters(new URLSearchParams("status=new&priority=meh&waiting=yes"))).toEqual(NO_FILTERS)
  })

  it("writes changes, drops empty values and keeps the open case", () => {
    const qs = withFilters("case=case-test-1&q=old", { status: "open", q: "", waitingOnUs: true })
    expect(new URLSearchParams(qs).get("case")).toBe("case-test-1")
    expect(new URLSearchParams(qs).get("q")).toBeNull()
    expect(parseCaseFilters(new URLSearchParams(qs))).toEqual({ ...NO_FILTERS, status: "open", waitingOnUs: true })
    expect(clearFilters(qs)).toBe("case=case-test-1")
  })

  it("opens and closes the panel without touching filters", () => {
    expect(withOpenCase("status=open", "case-test-2")).toBe("status=open&case=case-test-2")
    expect(withOpenCase("status=open&case=case-test-2", null)).toBe("status=open")
  })

  it("round-trips: parse(write(f)) is f", () => {
    const f = { q: "export", status: "waiting_on_them" as const, priority: "normal" as const, waitingOnUs: false }
    expect(parseCaseFilters(new URLSearchParams(withFilters("", f)))).toEqual(f)
    expect(hasFilters(f)).toBe(true)
    expect(hasFilters(NO_FILTERS)).toBe(false)
  })
})

describe("filterCases", () => {
  it("by status, priority and waiting on you", () => {
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, status: "closed" }))).toEqual([FIXTURE_SUBJECTS.closed])
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, priority: "urgent" }))).toEqual([FIXTURE_SUBJECTS.urgent])
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, waitingOnUs: true }))).toEqual([
      FIXTURE_SUBJECTS.urgent,
      FIXTURE_SUBJECTS.overdue,
    ])
  })

  it("searches subject, snippet, contact name and email, case-insensitively", () => {
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, q: "EXPORT" }))).toEqual([FIXTURE_SUBJECTS.waiting])
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, q: "login page" }))).toEqual([FIXTURE_SUBJECTS.overdue])
    expect(subjects(filterCases(CASES, { ...NO_FILTERS, q: "charlie@" }))).toEqual([FIXTURE_SUBJECTS.closed])
    expect(filterCases(CASES, { ...NO_FILTERS, q: "zzz" })).toEqual([])
  })
})

describe("Overview selectors", () => {
  it("oldest waiting on you: longest wait first, closed and waiting-on-them left out", () => {
    expect(subjects(oldestWaitingOnUs(CASES))).toEqual([FIXTURE_SUBJECTS.overdue, FIXTURE_SUBJECTS.urgent])
    expect(oldestWaitingOnUs(CASES, 1)).toHaveLength(1)
    expect(oldestWaitingOnUs(CASES.map((c) => ({ ...c, status: "closed" as const })))).toEqual([])
  })

  it("overdue after three days waiting on you", () => {
    const [urgent, overdue, waiting] = CASES
    expect(isOverdue(overdue!, FIXED_NOW_MS)).toBe(true)
    expect(isOverdue(urgent!, FIXED_NOW_MS)).toBe(false)
    expect(isOverdue(waiting!, FIXED_NOW_MS)).toBe(false)
  })

  it("age labels", () => {
    expect(ageLabel(new Date(FIXED_NOW_MS - 2 * 3_600_000).toISOString(), FIXED_NOW_MS)).toBe("2h")
    expect(ageLabel(null, FIXED_NOW_MS)).toBe("—")
  })
})

describe("filterAccounts", () => {
  const accounts = [
    ...crmFixtureAccounts(FIXED_NOW_MS),
    { id: "org-2", name: "another.example", domain: "another.example", contacts: [], openCases: 0, waitingOnUsCount: 0, lastActivityAt: null },
  ]

  it("newest activity first; search name, domain and people", () => {
    expect(filterAccounts(accounts, "").map((a) => a.id)).toEqual(["org-1", "org-2"])
    expect(filterAccounts(accounts, "another").map((a) => a.id)).toEqual(["org-2"])
    expect(filterAccounts(accounts, "example.com").map((a) => a.id)).toEqual(["org-1"])
    expect(filterAccounts(accounts, "bravo").map((a) => a.id)).toEqual(["org-1"])
    expect(filterAccounts(accounts, "nothing")).toEqual([])
  })
})
