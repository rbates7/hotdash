import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS, LATE_EVENING_CT_MS } from "@/test/clock"
import { todayIn } from "@/lib/clock"

import {
  PLANS,
  contactDisplayName,
  countByStatus,
  countTriagePending,
  filterCases,
  filterContacts,
  formatCrmDateTime,
  formatCrmRelative,
  isPlan,
  listTriageThreads,
  newContactEmailError,
  oldestUntouched,
  searchCrm,
  urgentOpenCount,
} from "./crm"
import { seedCases, seedContacts, seedMessages, seedNotes, seedOrganizations } from "./fixture"

const NOW = FIXED_NOW_MS

describe("seed", () => {
  it("has the discovery counts: 6 contacts, 8 cases, 2 triage threads", () => {
    expect(seedContacts(NOW)).toHaveLength(6)
    expect(seedCases(NOW)).toHaveLength(8)
    expect(seedOrganizations(NOW)).toHaveLength(3)
    expect(listTriageThreads(seedMessages(NOW))).toHaveLength(2)
    expect(seedNotes(NOW)).toHaveLength(5)
  })

  it("puts every seed contact on a metrics Plan value", () => {
    const plans = seedContacts(NOW).map((c) => c.plan)
    expect(plans.every((plan) => plan !== null && isPlan(plan))).toBe(true)
    expect(new Set(plans)).toEqual(new Set(PLANS))
    expect(PLANS).toEqual(["Monthly", "Annual", "Staff"])
  })

  it("dates activity from the given instant so relative copy stays true", () => {
    const cases = seedCases(NOW)
    const invite = cases.find((c) => c.id === "case-1")!
    expect(formatCrmRelative(invite.lastActivityAt, NOW)).toBe("2h ago")
    const safari = cases.find((c) => c.id === "case-7")!
    expect(formatCrmRelative(safari.lastActivityAt, NOW)).toBe("1d ago")
  })

  it("moves with the clock — the same offsets stay 2h / 1d later", () => {
    const later = NOW + 3 * 24 * 60 * 60 * 1000
    const cases = seedCases(later)
    expect(formatCrmRelative(cases.find((c) => c.id === "case-1")!.lastActivityAt, later)).toBe(
      "2h ago"
    )
  })
})

describe("counts and lists", () => {
  it("counts statuses and urgent open", () => {
    const cases = seedCases(NOW)
    expect(countByStatus(cases)).toEqual({ new: 1, open: 3, waiting: 2, closed: 2 })
    expect(urgentOpenCount(cases)).toBe(1)
  })

  it("oldest untouched is new/open, oldest activity first", () => {
    const oldest = oldestUntouched(seedCases(NOW))
    expect(oldest.map((c) => c.caseNumber)).toEqual([5, 7, 4, 1])
  })

  it("filters cases by status, priority and query", () => {
    const cases = seedCases(NOW)
    const contacts = seedContacts(NOW)
    const orgs = seedOrganizations(NOW)
    expect(filterCases(cases, contacts, orgs, { status: "new" })).toHaveLength(1)
    expect(filterCases(cases, contacts, orgs, { priority: "urgent" })[0]!.caseNumber).toBe(5)
    expect(filterCases(cases, contacts, orgs, { q: "#3" })[0]!.subject).toMatch(/Playbook sync/)
    expect(filterCases(cases, contacts, orgs, { q: "hale" }).every((c) => c.contactId === "contact-1")).toBe(
      true
    )
  })

  it("searches contacts and cases together", () => {
    const hits = searchCrm("#4", seedCases(NOW), seedContacts(NOW), seedOrganizations(NOW))
    expect(hits.cases).toHaveLength(1)
    expect(hits.cases[0]!.subject).toMatch(/Install \/ plays/)
    const people = filterContacts(seedContacts(NOW), seedOrganizations(NOW), "riverbend")
    expect(people).toHaveLength(1)
    expect(contactDisplayName(people[0]!)).toBe("Priya Shah")
  })

  it("groups pending triage by thread, newest first", () => {
    const threads = listTriageThreads(seedMessages(NOW))
    expect(countTriagePending(seedMessages(NOW))).toBe(2)
    expect(threads[0]!.senderName).toBe("Riley Nash")
    expect(threads[1]!.messageCount).toBe(2)
    expect(threads[1]!.senderEmail).toBe("alex@oakmontcoaches.net")
  })
})

describe("new-contact email", () => {
  it("rejects malformed and duplicate addresses", () => {
    const existing = seedContacts(NOW).map((c) => c.email)
    expect(newContactEmailError("not-an-email", existing)).toBe("Enter a valid email address.")
    expect(newContactEmailError("mhale@westfieldfb.org", existing)).toBe(
      "A contact with this email already exists."
    )
    expect(newContactEmailError("  MHALE@westfieldfb.org ", existing)).toBe(
      "A contact with this email already exists."
    )
    expect(newContactEmailError("pat@katyisd.org", existing)).toBeNull()
  })
})

describe("display", () => {
  it("falls back to email when a contact has no name", () => {
    expect(contactDisplayName({ firstName: null, lastName: null, email: "x@y.com" })).toBe("x@y.com")
  })

  it("formats datetimes in Central even when UTC has moved on", () => {
    // 23:30 Central on 7 Oct 2026; UTC is already the 8th.
    expect(todayIn(new Date(LATE_EVENING_CT_MS))).toBe("2026-10-07")
    const stamp = new Date(LATE_EVENING_CT_MS).toISOString()
    const label = formatCrmDateTime(stamp)
    expect(label).toMatch(/Oct 7/)
    expect(label).not.toMatch(/Oct 8/)
  })
})
