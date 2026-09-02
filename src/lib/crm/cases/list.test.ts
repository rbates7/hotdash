import { beforeEach, describe, expect, it } from "vitest"

import { createDb, type Db } from "@/lib/crm/db/client"
import { cases } from "@/lib/crm/db/schema"
import { createContact } from "@/lib/crm/contacts/server"
import { eq } from "drizzle-orm"

import { countOverdueCases, createCaseForThread, listCases } from "./server"

const DAY = 24 * 60 * 60 * 1000

describe("listCases filtering and sorting", () => {
  let db: Db

  /** Case numbers in the order returned. */
  const numbersOf = (rows: { caseNumber: number }[]) =>
    rows.map((r) => r.caseNumber)

  beforeEach(() => {
    db = createDb(":memory:").db

    const paying = createContact(db, {
      email: "zara@acme.com",
      firstName: "Zara",
      lastName: "Ali",
      nameSource: "stripe",
      source: "stripe",
      stripeCustomerId: "cus_1",
    }).id
    const lead = createContact(db, {
      email: "adam@westhigh.edu",
      firstName: "Adam",
      lastName: "Brooks",
      nameSource: "gmail",
      source: "gmail",
    }).id

    const now = Date.now()
    // #1 paying customer, waiting on them (we answered last), recent.
    const c1 = createCaseForThread(db, {
      contactId: paying,
      subject: "Billing question",
      gmailThreadId: "t1",
      createdAt: new Date(now),
    })
    db.update(cases)
      .set({
        status: "waiting",
        priority: "high",
        lastActivityAt: new Date(now - 1 * DAY),
        lastInboundAt: new Date(now - 3 * DAY),
        lastOutboundAt: new Date(now - 1 * DAY),
      })
      .where(eq(cases.id, c1.id))
      .run()

    // #2 unknown lead, waiting on us, old.
    const c2 = createCaseForThread(db, {
      contactId: lead,
      subject: "app keeps crashing",
      gmailThreadId: "t2",
      createdAt: new Date(now),
    })
    db.update(cases)
      .set({
        status: "open",
        priority: "urgent",
        lastActivityAt: new Date(now - 45 * DAY),
        lastInboundAt: new Date(now - 45 * DAY),
        lastOutboundAt: new Date(now - 60 * DAY),
      })
      .where(eq(cases.id, c2.id))
      .run()

    // #3 unknown lead, never answered at all, recent.
    const c3 = createCaseForThread(db, {
      contactId: lead,
      subject: "Can I get a team plan?",
      gmailThreadId: "t3",
      createdAt: new Date(now),
    })
    db.update(cases)
      .set({
        status: "new",
        priority: "normal",
        lastActivityAt: new Date(now - 2 * DAY),
        lastInboundAt: new Date(now - 2 * DAY),
        lastOutboundAt: null,
      })
      .where(eq(cases.id, c3.id))
      .run()
  })

  it("needsReply keeps only cases where they spoke last", async () => {
    const { rows, total } = await listCases(db, { needsReply: true })
    expect(numbersOf(rows).sort()).toEqual([2, 3])
    expect(total).toBe(2)
  })

  it("needsReply counts a case we have never answered", async () => {
    const { rows } = await listCases(db, { needsReply: true, window: "7d" })
    expect(numbersOf(rows)).toEqual([3])
  })

  it("window filters on last activity", async () => {
    expect(numbersOf((await listCases(db, { window: "7d" })).rows).sort()).toEqual([1, 3])
    expect((await listCases(db, { window: "90d" })).total).toBe(3)
  })

  it("audience splits paying customers from unknown senders", async () => {
    expect(numbersOf((await listCases(db, { audience: "customer" })).rows)).toEqual([1])
    expect(numbersOf((await listCases(db, { audience: "unknown" })).rows).sort()).toEqual([2, 3])
  })

  it("sorts by subject, case-insensitively", async () => {
    const asc = await listCases(db, { sort: "subject", direction: "asc" })
    // "app keeps crashing" must lead despite its lowercase a; then
    // "Billing question", then "Can I get a team plan?".
    expect(numbersOf(asc.rows)).toEqual([2, 1, 3])
    const desc = await listCases(db, { sort: "subject", direction: "desc" })
    expect(numbersOf(desc.rows)).toEqual([3, 1, 2])
  })

  it("sorts by contact display name, not by email", async () => {
    // Adam Brooks < Zara Ali by name; by email adam@ also leads, so the
    // paying customer's two cases are what distinguish the orderings.
    const asc = await listCases(db, { sort: "contact", direction: "asc" })
    expect(asc.rows[asc.rows.length - 1]!.caseNumber).toBe(1)
    const desc = await listCases(db, { sort: "contact", direction: "desc" })
    expect(desc.rows[0]!.caseNumber).toBe(1)
  })

  it("sorts status by workflow order rather than alphabetically", async () => {
    const asc = await listCases(db, { sort: "status", direction: "asc" })
    // new → open → waiting, not "new, open, waiting" by luck of the alphabet.
    expect(numbersOf(asc.rows)).toEqual([3, 2, 1])
  })

  it("sorts priority by severity", async () => {
    const asc = await listCases(db, { sort: "priority", direction: "asc" })
    expect(numbersOf(asc.rows)).toEqual([2, 1, 3])
  })

  it("sorts by case number", async () => {
    const asc = await listCases(db, { sort: "number", direction: "asc" })
    expect(numbersOf(asc.rows)).toEqual([1, 2, 3])
  })

  it("defaults to newest activity first", async () => {
    expect(numbersOf((await listCases(db, {})).rows)).toEqual([1, 3, 2])
  })

  it("overdue: waiting on your reply for three days or more, and not closed", async () => {
    // #2 has waited 45 days; #3 only two; on #1 you spoke last.
    const { rows, total } = await listCases(db, { overdue: true })
    expect(numbersOf(rows)).toEqual([2])
    expect(total).toBe(1)
    expect(countOverdueCases(db)).toBe(1)
    db.update(cases).set({ status: "closed" }).where(eq(cases.caseNumber, 2)).run()
    expect(countOverdueCases(db)).toBe(0)
  })

  it("sorts by age: the longest wait first on the way down", async () => {
    // Age counts from their last message when they spoke last (#2: 45
    // days, #3: two days), else from when the case opened (#1: today).
    const desc = await listCases(db, { sort: "age", direction: "desc" })
    expect(numbersOf(desc.rows)).toEqual([2, 3, 1])
    const asc = await listCases(db, { sort: "age", direction: "asc" })
    expect(numbersOf(asc.rows)).toEqual([1, 3, 2])
  })

  it("combines filters, and the total reflects them", async () => {
    const { rows, total } = await listCases(db, {
      needsReply: true,
      audience: "unknown",
      window: "90d",
      sort: "number",
      direction: "asc",
    })
    expect(numbersOf(rows)).toEqual([2, 3])
    expect(total).toBe(2)
  })
})
