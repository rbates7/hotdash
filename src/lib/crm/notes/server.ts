import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import { cases, notes, type Note } from "@/lib/crm/db/schema"

export function addUserNote(db: Db, caseId: string, body: string): Note {
  const trimmed = body.trim()
  if (!trimmed) throw new ValidationError("Note body is required.")
  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseRow) throw new NotFoundError("Case not found.")
  const id = randomUUID()
  db.insert(notes)
    .values({ id, caseId, kind: "user", body: trimmed, createdAt: new Date() })
    .run()
  return db.select().from(notes).where(eq(notes.id, id)).get()!
}

export function deleteUserNote(db: Db, noteId: string) {
  const note = db.select().from(notes).where(eq(notes.id, noteId)).get()
  if (!note) throw new NotFoundError("Note not found.")
  if (note.kind !== "user") {
    throw new ValidationError("System notes cannot be deleted.")
  }
  db.delete(notes).where(eq(notes.id, noteId)).run()
}
