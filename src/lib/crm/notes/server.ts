import { randomUUID } from "node:crypto"

import { desc, eq } from "drizzle-orm"

import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import { cases, contacts, notes, type Note } from "@/lib/crm/db/schema"

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

/** Kinds you can write yourself; system notes are the case's own record. */
export const CONTACT_NOTE_KINDS = ["user", "call"] as const
export type ContactNoteKind = (typeof CONTACT_NOTE_KINDS)[number]

// A logged call may sit a little ahead of the server clock; further than
// this and the date is a mistake.
const CLOCK_SLACK_MS = 5 * 60 * 1000

/**
 * A note about the person rather than about one conversation: what you
 * know about them, or a call you had. A call is dated when it happened,
 * so one logged the next morning sorts where it belongs.
 */
export function addContactNote(
  db: Db,
  contactId: string,
  input: { body: string; kind: ContactNoteKind; at?: Date | null }
): Note {
  const trimmed = input.body.trim()
  if (!trimmed) throw new ValidationError("Note body is required.")
  if (!CONTACT_NOTE_KINDS.includes(input.kind)) {
    throw new ValidationError(`Unknown note kind "${input.kind}".`)
  }
  const contact = db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get()
  if (!contact) throw new NotFoundError("Contact not found.")
  const createdAt = input.at ?? new Date()
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("That date is not valid.")
  }
  if (createdAt.getTime() > Date.now() + CLOCK_SLACK_MS) {
    throw new ValidationError("A call cannot be logged in the future.")
  }
  const id = randomUUID()
  db.insert(notes)
    .values({
      id,
      caseId: null,
      contactId,
      kind: input.kind,
      body: trimmed,
      createdAt,
    })
    .run()
  return db.select().from(notes).where(eq(notes.id, id)).get()!
}

/** Everything noted about a person, newest first. */
export function listContactNotes(db: Db, contactId: string): Note[] {
  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt))
    .all()
}

export function deleteUserNote(db: Db, noteId: string) {
  const note = db.select().from(notes).where(eq(notes.id, noteId)).get()
  if (!note) throw new NotFoundError("Note not found.")
  if (note.kind === "system") {
    throw new ValidationError("System notes cannot be deleted.")
  }
  db.delete(notes).where(eq(notes.id, noteId)).run()
}
