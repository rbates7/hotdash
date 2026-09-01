import { beforeEach, describe, expect, it } from "vitest"

import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, notes } from "@/lib/crm/db/schema"
import { createContact } from "@/lib/crm/contacts/server"
import { eq } from "drizzle-orm"

import {
  applyMessageToCase,
  createCaseForThread,
  setCaseStatus,
} from "./server"

describe("cases server", () => {
  let db: Db
  let contactId: string

  beforeEach(() => {
    db = createDb(":memory:").db
    contactId = createContact(db, {
      email: "dana@acme.com",
      firstName: "Dana",
      lastName: "Whitfield",
      nameSource: "manual",
      source: "manual",
    }).id
  })

  it("assigns sequential case numbers", () => {
    const first = createCaseForThread(db, {
      contactId,
      subject: "First",
      gmailThreadId: "t1",
      createdAt: new Date(),
    })
    const second = createCaseForThread(db, {
      contactId,
      subject: "Second",
      gmailThreadId: "t2",
      createdAt: new Date(),
    })
    expect(first.caseNumber).toBe(1)
    expect(second.caseNumber).toBe(2)
  })

  it("reopens a closed case on inbound mail and records a system note", () => {
    const caseRow = createCaseForThread(db, {
      contactId,
      subject: "Broken invite",
      gmailThreadId: "t1",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    })
    setCaseStatus(db, caseRow.id, "closed")
    const closed = db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRow.id))
      .get()!
    expect(closed.status).toBe("closed")
    expect(closed.closedAt).toBeInstanceOf(Date)

    const status = applyMessageToCase(db, closed, {
      direction: "inbound",
      sentAt: new Date("2026-08-20T09:00:00Z"),
      fromName: "Dana Whitfield",
      fromEmail: "dana@acme.com",
    })
    expect(status).toBe("open")

    const reopened = db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRow.id))
      .get()!
    expect(reopened.status).toBe("open")
    expect(reopened.closedAt).toBeNull()
    expect(reopened.lastInboundAt?.toISOString()).toBe(
      "2026-08-20T09:00:00.000Z"
    )

    const caseNotes = db
      .select()
      .from(notes)
      .where(eq(notes.caseId, caseRow.id))
      .all()
    expect(
      caseNotes.some(
        (n) =>
          n.kind === "system" && n.body === "Reopened by email from Dana Whitfield"
      )
    ).toBe(true)
  })

  it("parks a case on the customer after an outbound reply", () => {
    const caseRow = createCaseForThread(db, {
      contactId,
      subject: "Question",
      gmailThreadId: "t1",
      createdAt: new Date(),
    })
    const status = applyMessageToCase(db, caseRow, {
      direction: "outbound",
      sentAt: new Date(),
      fromName: null,
      fromEmail: "rashad@chlk.xyz",
    })
    expect(status).toBe("waiting")
  })

  it("does not move lastActivityAt backwards for older backfilled mail", () => {
    const caseRow = createCaseForThread(db, {
      contactId,
      subject: "Backfill",
      gmailThreadId: "t1",
      createdAt: new Date("2026-08-10T00:00:00Z"),
    })
    applyMessageToCase(db, caseRow, {
      direction: "inbound",
      sentAt: new Date("2026-08-15T00:00:00Z"),
      fromName: null,
      fromEmail: "dana@acme.com",
    })
    const mid = db.select().from(cases).where(eq(cases.id, caseRow.id)).get()!
    applyMessageToCase(db, mid, {
      direction: "inbound",
      sentAt: new Date("2026-08-12T00:00:00Z"),
      fromName: null,
      fromEmail: "dana@acme.com",
    })
    const final = db.select().from(cases).where(eq(cases.id, caseRow.id)).get()!
    expect(final.lastActivityAt?.toISOString()).toBe("2026-08-15T00:00:00.000Z")
  })
})
