import { and, desc, eq } from "drizzle-orm"

import { cleanSubject } from "@/lib/crm/cases/rules"
import { FORM_CASE_PREFIX } from "@/lib/crm/gmail/sync"
import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/crm/cases/server"
import { splitDisplayName } from "@/lib/crm/contacts/matching"
import {
  addContactEmail,
  createContact,
  findContactByEmail,
} from "@/lib/crm/contacts/server"
import { NotFoundError, ValidationError } from "@/lib/crm/core/errors"
import type { Db } from "@/lib/crm/db/client"
import {
  cases,
  contacts,
  emailMessages,
  ignoredSenders,
  type Contact,
  type EmailMessage,
} from "@/lib/crm/db/schema"

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

/** One triage item: a thread as far as a single sender goes. Contact-form
 * submissions all share one Gmail thread, so grouping by thread alone put
 * twenty strangers behind one Promote button. */
function groupKey(threadId: string, senderEmail: string) {
  return `${threadId}\n${senderEmail}`
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
    const key = groupKey(row.gmailThreadId, row.fromEmail)
    const list = byThread.get(key) ?? []
    list.push(row)
    byThread.set(key, list)
  }

  return [...byThread.values()].map((messages) => {
    const latest = messages[0]!
    const earliest = messages[messages.length - 1]!
    return {
      gmailThreadId: latest.gmailThreadId,
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

function pendingInThread(
  db: Db,
  gmailThreadId: string,
  senderEmail?: string
) {
  return db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.gmailThreadId, gmailThreadId),
        eq(emailMessages.triageState, "pending"),
        senderEmail ? eq(emailMessages.fromEmail, senderEmail) : undefined
      )
    )
    .all()
}

// Converts one sender's pending messages in a thread into a case.
function promoteThreadToCase(
  db: Db,
  contact: Contact,
  gmailThreadId: string,
  senderEmail: string
) {
  const pending = pendingInThread(db, gmailThreadId, senderEmail)
  if (pending.length === 0) return null

  const ordered = [...pending].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  )
  const earliest = ordered[0]!
  // A thread carrying more than one sender is a form's queue, not a
  // conversation, so each submission is keyed by itself. Counting every
  // stored message, not just the pending ones, keeps that true however
  // many have already been promoted.
  const senders = new Set(
    db
      .select({ fromEmail: emailMessages.fromEmail })
      .from(emailMessages)
      .where(eq(emailMessages.gmailThreadId, gmailThreadId))
      .all()
      .map((row) => row.fromEmail)
  )
  const caseKey =
    senders.size > 1
      ? `${FORM_CASE_PREFIX}${earliest.gmailMessageId}`
      : gmailThreadId
  const caseRow =
    getCaseByThreadId(db, caseKey) ??
    createCaseForThread(db, {
      contactId: contact.id,
      subject: cleanSubject(earliest.subject),
      gmailThreadId: caseKey,
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
  /** Which sender in that thread; a form's thread holds many. */
  senderEmail?: string
  action: "promote" | "link" | "ignore"
  contactId?: string
  ignoreSenderAlways?: boolean
}

export function resolveTriage(db: Db, resolution: TriageResolution) {
  const inThread = pendingInThread(db, resolution.gmailThreadId)
  if (inThread.length === 0) {
    throw new NotFoundError("No pending messages in that thread.")
  }
  // The sender the card showed. Without one, fall back to the newest
  // message, which is what the list used to offer.
  const senderEmail =
    resolution.senderEmail ??
    [...inThread].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0]!
      .fromEmail
  const pending = inThread.filter((m) => m.fromEmail === senderEmail)
  if (pending.length === 0) {
    throw new NotFoundError("No pending messages from that sender.")
  }

  if (resolution.action === "ignore") {
    db.update(emailMessages)
      .set({ triageState: "ignored" })
      .where(
        and(
          eq(emailMessages.gmailThreadId, resolution.gmailThreadId),
          eq(emailMessages.fromEmail, senderEmail),
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

  // Linking by hand is how the CRM learns a customer's other addresses.
  addContactEmail(db, contact.id, senderEmail)

  const caseRow = promoteThreadToCase(
    db,
    contact,
    resolution.gmailThreadId,
    senderEmail
  )

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
    promoteThreadToCase(db, contact, threadId, senderEmail)
  }

  return { caseId: caseRow?.id ?? null, contactId: contact.id }
}
