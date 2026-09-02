import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { contacts } from "@/lib/crm/db/schema"

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
