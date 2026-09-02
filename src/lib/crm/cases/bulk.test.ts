import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { NotFoundError } from "@/lib/crm/core/errors"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, notes } from "@/lib/crm/db/schema"

import { createCaseForThread, setCaseStatusBulk } from "./server"

describe("setCaseStatusBulk", () => {
  let db: Db
  let ids: string[]

  beforeEach(() => {
    db = createDb(":memory:").db
    const contact = createContact(db, { email: "a@b.co", source: "gmail" })
    ids = ["t1", "t2", "t3"].map(
      (thread) =>
        createCaseForThread(db, {
          contactId: contact.id,
          subject: thread,
          gmailThreadId: thread,
          createdAt: new Date(),
        }).id
    )
  })

  const statuses = () =>
    ids.map((id) => db.select().from(cases).where(eq(cases.id, id)).get()!.status)

  it("closes every case in the batch and leaves a note on each", () => {
    expect(setCaseStatusBulk(db, [ids[0]!, ids[1]!], "closed")).toBe(2)
    expect(statuses()).toEqual(["closed", "closed", "new"])
    const closedNotes = db
      .select()
      .from(notes)
      .where(eq(notes.body, "Status changed to Closed"))
      .all()
    expect(closedNotes.map((note) => note.caseId).sort()).toEqual(
      [ids[0], ids[1]].sort()
    )
  })

  it("skips cases already in that status, and repeats in the list", () => {
    setCaseStatusBulk(db, [ids[0]!], "closed")
    expect(setCaseStatusBulk(db, [ids[0]!, ids[0]!, ids[2]!], "closed")).toBe(1)
  })

  it("is all or nothing: an unknown id rolls the batch back", () => {
    expect(() => setCaseStatusBulk(db, [ids[0]!, "missing"], "closed")).toThrow(
      NotFoundError
    )
    expect(statuses()).toEqual(["new", "new", "new"])
    expect(db.select().from(notes).all()).toHaveLength(0)
  })
})
