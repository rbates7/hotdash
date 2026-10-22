import { describe, expect, it } from "vitest"

import { nextCaseNumber } from "../cases/server"
import { getDb } from "./client"
import { createTestDb } from "./test-client"
import { cases, contacts, organizations } from "./schema"

describe("db client", () => {
  it("reports missing runtime configuration clearly", () => {
    const originalCrm = process.env.CRM_DATABASE_URL
    const originalDefault = process.env.DATABASE_URL
    delete process.env.CRM_DATABASE_URL
    delete process.env.DATABASE_URL
    expect(() => getDb()).toThrow("CRM_DATABASE_URL or DATABASE_URL")
    if (originalCrm === undefined) delete process.env.CRM_DATABASE_URL
    else process.env.CRM_DATABASE_URL = originalCrm
    if (originalDefault === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDefault
  })

  it("migrates, inserts, and reads back", async () => {
    const { db, close } = await createTestDb()
    const now = new Date()

    await db.insert(organizations)
      .values({ id: "org1", name: "Acme", createdAt: now, updatedAt: now })
    await db.insert(contacts)
      .values({
        id: "c1",
        email: "dana@acme.com",
        source: "manual",
        organizationId: "org1",
        createdAt: now,
        updatedAt: now,
      })
    await db.insert(cases)
      .values({
        id: "case1",
        caseNumber: 1,
        subject: "Hello",
        contactId: "c1",
        createdAt: now,
        updatedAt: now,
      })

    const row = await db.query.cases.findFirst({ with: { contact: true } })
    expect(row?.subject).toBe("Hello")
    expect(row?.contact.email).toBe("dana@acme.com")
    expect(row?.createdAt).toBeInstanceOf(Date)
    await close()
  })

  it("increments the case counter atomically", async () => {
    const { db, close } = await createTestDb()
    const values = await Promise.all(
      Array.from({ length: 12 }, () => nextCaseNumber(db))
    )
    expect([...values].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    )
    await close()
  })

  it("enforces normalized contact email uniqueness", async () => {
    const { db, close } = await createTestDb()
    const now = new Date()
    await db.insert(contacts).values({
      id: "c1",
      email: "dana@acme.com",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })
    await expect(
      db.insert(contacts).values({
        id: "c2",
        email: "DANA@ACME.COM",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      })
    ).rejects.toThrow()
    await close()
  })

  it("enforces normalized organization domain uniqueness", async () => {
    const { db, close } = await createTestDb()
    const now = new Date()
    await db.insert(organizations).values({
      id: "org1",
      name: "Acme",
      domain: "acme.com",
      createdAt: now,
      updatedAt: now,
    })
    await expect(
      db.insert(organizations).values({
        id: "org2",
        name: "Acme North",
        domain: "ACME.COM",
        createdAt: now,
        updatedAt: now,
      })
    ).rejects.toThrow()
    await close()
  })
})
