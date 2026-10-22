import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import { cases, notes, type Note } from "@/lib/crm/db/schema"

export async function addUserNote(db: Db, caseId: string, body: string): Promise<Note> {
  const trimmed = body.trim()
  if (!trimmed) throw new ValidationError("Note body is required.")
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1)
  if (!caseRow) throw new NotFoundError("Case not found.")
  const id = randomUUID()
  const [created] = await db.insert(notes)
    .values({ id, caseId, kind: "user", body: trimmed, createdAt: new Date() })
    .returning()
  return created!
}

export async function deleteUserNote(db: Db, noteId: string) {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1)
  if (!note) throw new NotFoundError("Note not found.")
  if (note.kind !== "user") {
    throw new ValidationError("System notes cannot be deleted.")
  }
  await db.delete(notes).where(eq(notes.id, noteId))
}
