import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createCaseForThread } from "@/lib/crm/cases/server"
import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages, notes } from "@/lib/crm/db/schema"

import { getDashboardData } from "./server"

const DAY = 24 * 60 * 60 * 1000

describe("getDashboardData new and churned lists", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    const now = Date.now()
    const plant = (
      email: string,
      planStatus: string | null,
      dates: { startedAt?: number; endedAt?: number }
    ) => {
      const contact = createContact(db, {
        email,
        source: "stripe",
        plan: planStatus ? "Monthly Webapp" : null,
        planStatus,
      })
      db.update(contacts)
        .set({
          planStartedAt: dates.startedAt === undefined ? null : new Date(now + dates.startedAt),
          planEndedAt: dates.endedAt === undefined ? null : new Date(now + dates.endedAt),
        })
        .where(eq(contacts.id, contact.id))
        .run()
    }
    plant("new@x.io", "active", { startedAt: -2 * DAY })
    plant("older@x.io", "active", { startedAt: -20 * DAY })
    plant("trial@x.io", "trialing", { startedAt: +3 * DAY })
    plant("gone@x.io", "canceled", { startedAt: -300 * DAY, endedAt: -1 * DAY })
    plant("longgone@x.io", "canceled", { startedAt: -300 * DAY, endedAt: -40 * DAY })
    // Scheduled to cancel at the end of the period: still paying, no end.
    plant("leaving@x.io", "active", { startedAt: -100 * DAY })
    plant("never@x.io", null, {})
  })

  it("lists who started paying and who left in the last 7 days", async () => {
    const data = await getDashboardData(db)
    expect(data.newThisWeek.rows.map((r) => r.contact.email)).toEqual(["new@x.io"])
    expect(data.newThisWeek.total).toBe(1)
    expect(data.churnedThisWeek.rows.map((r) => r.contact.email)).toEqual(["gone@x.io"])
    expect(data.churnedThisWeek.total).toBe(1)
  })
})

describe("getDashboardData reached out from mail and calls", () => {
  it("ticks only an email or a call on or after the event", async () => {
    const db = createDb(":memory:").db
    const now = Date.now()
    const send = (contactId: string, id: string, sentAt: Date) =>
      db
        .insert(emailMessages)
        .values({
          id,
          gmailMessageId: `gm-${id}`,
          gmailThreadId: `t-${id}`,
          caseId: null,
          contactId,
          direction: "outbound",
          fromEmail: "info@chlkapp.com",
          toEmails: ["x@y.z"],
          ccEmails: [],
          attachments: [],
          sentAt,
          createdAt: sentAt,
        })
        .run()
    const make = (email: string, planStatus: string, startedAt: number, endedAt?: number) => {
      const contact = createContact(db, { email, source: "stripe", plan: "Monthly Webapp", planStatus })
      db.update(contacts)
        .set({
          planStartedAt: new Date(now + startedAt),
          planEndedAt: endedAt === undefined ? null : new Date(now + endedAt),
        })
        .where(eq(contacts.id, contact.id))
        .run()
      return contact
    }

    // New this week, welcomed the day after paying started.
    const welcomed = make("welcomed@x.io", "active", -3 * DAY)
    send(welcomed.id, "w1", new Date(now - 2 * DAY))
    // New this week, last emailed before they started paying: not reached.
    const earlier = make("earlier@x.io", "active", -3 * DAY)
    send(earlier.id, "e1", new Date(now - 10 * DAY))
    // Churned; a reply from forty days ago is not outreach after the churn.
    const gone = make("gone@x.io", "canceled", -300 * DAY, -2 * DAY)
    send(gone.id, "g1", new Date(now - 40 * DAY))
    // Churned, and you called them the day after.
    const called = make("called@x.io", "canceled", -300 * DAY, -2 * DAY)
    db.insert(notes)
      .values({
        id: "n-called",
        caseId: null,
        contactId: called.id,
        kind: "call",
        body: "Asked what went wrong",
        createdAt: new Date(now - DAY),
      })
      .run()

    const data = await getDashboardData(db)
    const byEmail = (
      rows: { contact: { email: string }; contactedAt: Date | null; contactedVia: string | null }[]
    ) => Object.fromEntries(rows.map((r) => [r.contact.email, r]))
    const fresh = byEmail(data.newThisWeek.rows)
    expect(fresh["welcomed@x.io"]!.contactedAt).toEqual(new Date(now - 2 * DAY))
    expect(fresh["welcomed@x.io"]!.contactedVia).toBe("email")
    expect(fresh["earlier@x.io"]!.contactedAt).toBeNull()
    const churned = byEmail(data.churnedThisWeek.rows)
    expect(churned["gone@x.io"]!.contactedAt).toBeNull()
    expect(churned["called@x.io"]!.contactedVia).toBe("call")
  })
})

describe("getDashboardData oldest waiting on you", () => {
  it("lists only cases where the customer spoke last, longest wait first", async () => {
    const db = createDb(":memory:").db
    const now = Date.now()
    const contact = createContact(db, { email: "a@b.co", source: "gmail" })
    const plant = (thread: string, inboundDaysAgo: number | null, outboundDaysAgo: number | null, status: "new" | "open" | "waiting" | "closed") => {
      const row = createCaseForThread(db, {
        contactId: contact.id,
        subject: thread,
        gmailThreadId: thread,
        createdAt: new Date(now - 60 * DAY),
      })
      db.update(cases)
        .set({
          status,
          lastInboundAt: inboundDaysAgo === null ? null : new Date(now - inboundDaysAgo * DAY),
          lastOutboundAt: outboundDaysAgo === null ? null : new Date(now - outboundDaysAgo * DAY),
        })
        .where(eq(cases.id, row.id))
        .run()
      return row
    }
    plant("they-wrote-old", 20, 30, "open")
    plant("they-wrote-new", 2, null, "new")
    plant("you-replied", 10, 5, "open") // open, but the ball is with them
    plant("waiting", 10, 5, "waiting")
    plant("closed", 3, null, "closed")

    const data = await getDashboardData(db)
    expect(data.oldestUntouched.map((c) => c.subject)).toEqual([
      "they-wrote-old",
      "they-wrote-new",
    ])
  })
})
