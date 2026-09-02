import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createCaseForThread, setCaseStatus } from "@/lib/crm/cases/server"
import { createContact } from "@/lib/crm/contacts/server"
import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import { createDb, type Db } from "@/lib/crm/db/client"
import { notes } from "@/lib/crm/db/schema"

import { addContactNote, deleteUserNote, listContactNotes } from "./server"

const DAY = 24 * 60 * 60 * 1000

describe("contact notes and calls", () => {
  let db: Db
  let contactId: string

  beforeEach(() => {
    db = createDb(":memory:").db
    contactId = createContact(db, { email: "dana@acme.com", source: "manual" }).id
  })

  it("keeps a note about the person, off any case", () => {
    const note = addContactNote(db, contactId, { body: "  Prefers texts.  ", kind: "user" })
    expect(note.contactId).toBe(contactId)
    expect(note.caseId).toBeNull()
    expect(note.kind).toBe("user")
    expect(note.body).toBe("Prefers texts.")
  })

  it("dates a call when it happened, so a late entry sorts where it belongs", () => {
    const yesterday = new Date(Date.now() - DAY)
    addContactNote(db, contactId, { body: "Today's note", kind: "user" })
    const call = addContactNote(db, contactId, {
      body: "Talked through the staff plan",
      kind: "call",
      at: yesterday,
    })
    expect(call.createdAt).toEqual(yesterday)
    expect(listContactNotes(db, contactId).map((n) => n.body)).toEqual([
      "Today's note",
      "Talked through the staff plan",
    ])
  })

  it("refuses empty notes, unknown people, bad dates and the future", () => {
    expect(() => addContactNote(db, contactId, { body: "   ", kind: "user" })).toThrow(
      ValidationError
    )
    expect(() => addContactNote(db, "nope", { body: "x", kind: "user" })).toThrow(
      NotFoundError
    )
    expect(() =>
      addContactNote(db, contactId, { body: "x", kind: "call", at: new Date("garbage") })
    ).toThrow(ValidationError)
    expect(() =>
      addContactNote(db, contactId, { body: "x", kind: "call", at: new Date(Date.now() + DAY) })
    ).toThrow(ValidationError)
  })

  it("lets you delete a call or a note, never a system note", () => {
    const call = addContactNote(db, contactId, { body: "call", kind: "call" })
    deleteUserNote(db, call.id)
    expect(listContactNotes(db, contactId)).toHaveLength(0)

    const caseRow = createCaseForThread(db, {
      contactId,
      subject: "s",
      gmailThreadId: "t",
      createdAt: new Date(),
    })
    setCaseStatus(db, caseRow.id, "closed")
    const system = db.select().from(notes).where(eq(notes.kind, "system")).get()!
    expect(() => deleteUserNote(db, system.id)).toThrow(ValidationError)
  })
})
