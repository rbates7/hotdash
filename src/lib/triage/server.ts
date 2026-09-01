import { and, desc, eq } from "drizzle-orm"

import { cleanSubject } from "@/lib/cases/rules"
import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/cases/server"
import { splitDisplayName } from "@/lib/contacts/matching"
import { createContact, findContactByEmail } from "@/lib/contacts/server"
import { NotFoundError, ValidationError } from "@/lib/core/errors"
import type { Db } from "@/lib/db/client"
import {
  cases,
  contacts,
  emailMessages,
  ignoredSenders,
  type Contact,
  type EmailMessage,
} from "@/lib/db/schema"

export type TriageThread = {
  gmailThreadId: string
  senderEmail: string
  senderName: string | null
  subject: string | null
  snippet: string | null
  messageCount: number
  latestAt: Date
  messages: EmailMessage[]
}

export function listTriageThreads(db: Db): TriageThread[] {
  const rows = db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.triageState, "pending"))
    .orderBy(desc(emailMessages.sentAt))
    .all()

  const byThread = new Map<string, EmailMessage[]>()
  for (const row of rows) {
    const list = byThread.get(row.gmailThreadId) ?? []
    list.push(row)
    byThread.set(row.gmailThreadId, list)
  }

  return [...byThread.entries()].map(([threadId, messages]) => {
    const latest = messages[0]!
    const earliest = messages[messages.length - 1]!
    return {
      gmailThreadId: threadId,
      senderEmail: latest.fromEmail,
      senderName: latest.fromName,
      subject: earliest.subject,
      snippet: latest.snippet,
      messageCount: messages.length,
      latestAt: latest.sentAt,
      messages,
    }
  })
}

export function countTriagePending(db: Db): number {
  const rows = db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.triageState, "pending"))
    .all()
  return rows.length
}

function pendingInThread(db: Db, gmailThreadId: string) {
  return db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.gmailThreadId, gmailThreadId),
        eq(emailMessages.triageState, "pending")
      )
    )
    .all()
}

// Converts one pending thread into a case for the given contact.
function promoteThreadToCase(db: Db, contact: Contact, gmailThreadId: string) {
  const pending = pendingInThread(db, gmailThreadId)
  if (pending.length === 0) return null

  const ordered = [...pending].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  )
  const earliest = ordered[0]!
  const caseRow =
    getCaseByThreadId(db, gmailThreadId) ??
    createCaseForThread(db, {
      contactId: contact.id,
      subject: cleanSubject(earliest.subject),
      gmailThreadId,
      createdAt: earliest.sentAt,
    })

  for (const message of ordered) {
    db.update(emailMessages)
      .set({ caseId: caseRow.id, triageState: null })
      .where(eq(emailMessages.id, message.id))
      .run()
    const current = db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRow.id))
      .get()!
    applyMessageToCase(db, current, {
      direction: message.direction,
      sentAt: message.sentAt,
      fromName: message.fromName,
      fromEmail: message.fromEmail,
    })
  }
  return caseRow
}

export type TriageResolution = {
  gmailThreadId: string
  action: "promote" | "link" | "ignore"
  contactId?: string
  ignoreSenderAlways?: boolean
}

export function resolveTriage(db: Db, resolution: TriageResolution) {
  const pending = pendingInThread(db, resolution.gmailThreadId)
  if (pending.length === 0) {
    throw new NotFoundError("No pending messages in that thread.")
  }
  const senderEmail = pending[0]!.fromEmail

  if (resolution.action === "ignore") {
    db.update(emailMessages)
      .set({ triageState: "ignored" })
      .where(
        and(
          eq(emailMessages.gmailThreadId, resolution.gmailThreadId),
          eq(emailMessages.triageState, "pending")
        )
      )
      .run()
    if (resolution.ignoreSenderAlways) {
      db.insert(ignoredSenders)
        .values({ email: senderEmail, createdAt: new Date() })
        .onConflictDoNothing()
        .run()
      db.update(emailMessages)
        .set({ triageState: "ignored" })
        .where(
          and(
            eq(emailMessages.fromEmail, senderEmail),
            eq(emailMessages.triageState, "pending")
          )
        )
        .run()
    }
    return { caseId: null }
  }

  let contact: Contact
  if (resolution.action === "link") {
    if (!resolution.contactId) {
      throw new ValidationError("contactId is required to link.")
    }
    const existing = db
      .select()
      .from(contacts)
      .where(eq(contacts.id, resolution.contactId))
      .get()
    if (!existing) throw new NotFoundError("Contact not found.")
    contact = existing
  } else {
    const sender = pending[0]!
    const existing = findContactByEmail(db, senderEmail)
    contact =
      existing ??
      createContact(db, {
        email: senderEmail,
        ...splitDisplayName(sender.fromName),
        nameSource: "gmail",
        source: "gmail",
      })
  }

  const caseRow = promoteThreadToCase(db, contact, resolution.gmailThreadId)

  // Other pending threads from the same sender become cases too — the
  // sender is now a known contact.
  const otherPending = db
    .select({ threadId: emailMessages.gmailThreadId })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.fromEmail, senderEmail),
        eq(emailMessages.triageState, "pending")
      )
    )
    .all()
  const otherThreads = [...new Set(otherPending.map((r) => r.threadId))]
  for (const threadId of otherThreads) {
    promoteThreadToCase(db, contact, threadId)
  }

  return { caseId: caseRow?.id ?? null, contactId: contact.id }
}
