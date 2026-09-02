import { beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"

import { createDb, type Db } from "@/lib/crm/db/client"
import { contacts } from "@/lib/crm/db/schema"

import { createContact, listContacts, updateContactManual } from "./server"

describe("listContacts standing", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    const make = (email: string, planStatus: string | null) => {
      const contact = createContact(db, {
        email,
        nameSource: "stripe",
        source: "stripe",
      })
      db.update(contacts)
        .set({ planStatus })
        .where(eq(contacts.id, contact.id))
        .run()
    }
    make("paying@a.com", "active")
    make("trial@b.com", "trialing")
    make("cardfailed@c.com", "past_due")
    make("churned@d.com", "canceled")
    make("neverpaid@e.com", null)
  })

  it("shows only people currently paying by default", async () => {
    const { rows, total } = await listContacts(db, { standing: "active" })
    expect(total).toBe(3)
    expect(rows.map((r) => r.contact.email).sort()).toEqual([
      "cardfailed@c.com",
      "paying@a.com",
      "trial@b.com",
    ])
  })

  it("counts past_due as active — they have not left, their card failed", async () => {
    const { rows } = await listContacts(db, { standing: "active" })
    expect(rows.map((r) => r.contact.email)).toContain("cardfailed@c.com")
  })

  it("standing=all brings back churned and never-paid", async () => {
    expect((await listContacts(db, { standing: "all" })).total).toBe(5)
  })

  it("reports both counts regardless of which view is on", async () => {
    const active = await listContacts(db, { standing: "active" })
    const all = await listContacts(db, { standing: "all" })
    expect(active.standingCounts).toEqual({ active: 3, all: 5 })
    expect(all.standingCounts).toEqual({ active: 3, all: 5 })
  })

  it("type counts follow the standing view rather than the whole book", async () => {
    // Advertising "5 individuals" above a list of three would be a lie.
    const active = await listContacts(db, { standing: "active" })
    expect(active.counts.all).toBe(3)
  })
})

describe("updateContactManual organization", () => {
  it("marks a hand-made link as manual without freezing the name", () => {
    const db = createDb(":memory:").db
    const contact = createContact(db, {
      email: "coach@school.edu",
      firstName: "Pat",
      nameSource: "stripe",
      source: "stripe",
    })
    expect(contact.nameSource).toBe("stripe")
    const updated = updateContactManual(db, contact.id, {
      organizationName: "Westside Staff",
    })
    expect(updated.organizationSource).toBe("manual")
    // Only the link is manual; a later sync may still correct the name.
    expect(updated.nameSource).toBe("stripe")
  })
})
