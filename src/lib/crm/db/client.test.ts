import { describe, expect, it } from "vitest"

import { createDb } from "./client"
import { cases, contacts, organizations } from "./schema"

describe("db client", () => {
  it("migrates, inserts, and reads back", async () => {
    const { db, sqlite } = createDb(":memory:")
    const now = new Date()

    db.insert(organizations)
      .values({ id: "org1", name: "Acme", createdAt: now, updatedAt: now })
      .run()
    db.insert(contacts)
      .values({
        id: "c1",
        email: "dana@acme.com",
        source: "manual",
        organizationId: "org1",
        createdAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(cases)
      .values({
        id: "case1",
        caseNumber: 1,
        subject: "Hello",
        contactId: "c1",
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const row = await db.query.cases.findFirst({ with: { contact: true } })
    expect(row?.subject).toBe("Hello")
    expect(row?.contact.email).toBe("dana@acme.com")
    expect(row?.createdAt).toBeInstanceOf(Date)
    sqlite.close()
  })

  it("increments the case counter atomically", () => {
    const { sqlite } = createDb(":memory:")
    const stmt = sqlite.prepare(
      "UPDATE counters SET value = value + 1 WHERE id = 'case' RETURNING value"
    )
    const next = () => (stmt.get() as { value: number }).value
    expect(next()).toBe(1)
    expect(next()).toBe(2)
    expect(next()).toBe(3)
    sqlite.close()
  })
})
