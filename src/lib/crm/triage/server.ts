import { and, desc, eq, sql } from "drizzle-orm"

import { cleanSubject } from "@/lib/crm/cases/rules"
import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/crm/cases/server"
import { splitDisplayName } from "@/lib/crm/contacts/matching"
import { createContact, findContactByEmail } from "@/lib/crm/contacts/server"
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

export async function listTriageThreads(db: Db): Promise<TriageThread[]> {
  const rows = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.triageState, "pending"))
    .orderBy(desc(emailMessages.sentAt))

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

export async function countTriagePending(db: Db): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(emailMessages)
    .where(eq(emailMessages.triageState, "pending"))
  return rows[0]?.count ?? 0
}

async function pendingInThread(db: Db, gmailThreadId: string) {
  return await db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.gmailThreadId, gmailThreadId),
        eq(emailMessages.triageState, "pending")
      )
    )
}

// Converts one pending thread into a case for the given contact.
async function promoteThreadToCase(db: Db, contact: Contact, gmailThreadId: string) {
  const pending = await pendingInThread(db, gmailThreadId)
  if (pending.length === 0) return null

  const ordered = [...pending].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  )
  const earliest = ordered[0]!
  const caseRow =
    (await getCaseByThreadId(db, gmailThreadId)) ??
    (await createCaseForThread(db, {
      contactId: contact.id,
      subject: cleanSubject(earliest.subject),
      gmailThreadId,
      createdAt: earliest.sentAt,
    }))

  for (const message of ordered) {
    await db.update(emailMessages)
      .set({ caseId: caseRow.id, triageState: null })
      .where(eq(emailMessages.id, message.id))
    const [current] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRow.id))
      .limit(1)
    await applyMessageToCase(db, current!, {
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

export async function resolveTriage(db: Db, resolution: TriageResolution) {
  return db.transaction(async (tx) => {
  const pending = await pendingInThread(tx, resolution.gmailThreadId)
  if (pending.length === 0) {
    throw new NotFoundError("No pending messages in that thread.")
  }
  const senderEmail = pending[0]!.fromEmail

  if (resolution.action === "ignore") {
    await tx.update(emailMessages)
      .set({ triageState: "ignored" })
      .where(
        and(
          eq(emailMessages.gmailThreadId, resolution.gmailThreadId),
          eq(emailMessages.triageState, "pending")
        )
      )
    if (resolution.ignoreSenderAlways) {
      await tx.insert(ignoredSenders)
        .values({ email: senderEmail, createdAt: new Date() })
        .onConflictDoNothing()
      await tx.update(emailMessages)
        .set({ triageState: "ignored" })
        .where(
          and(
            eq(emailMessages.fromEmail, senderEmail),
            eq(emailMessages.triageState, "pending")
          )
        )
    }
    return { caseId: null }
  }

  let contact: Contact
  if (resolution.action === "link") {
    if (!resolution.contactId) {
      throw new ValidationError("contactId is required to link.")
    }
    const [existing] = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, resolution.contactId))
      .limit(1)
    if (!existing) throw new NotFoundError("Contact not found.")
    contact = existing
  } else {
    const sender = pending[0]!
    const existing = await findContactByEmail(tx, senderEmail)
    contact =
      existing ??
      (await createContact(tx, {
        email: senderEmail,
        ...splitDisplayName(sender.fromName),
        nameSource: "gmail",
        source: "gmail",
      }))
  }

  const caseRow = await promoteThreadToCase(tx, contact, resolution.gmailThreadId)

  // Other pending threads from the same sender become cases too — the
  // sender is now a known contact.
  const otherPending = await tx
    .select({ threadId: emailMessages.gmailThreadId })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.fromEmail, senderEmail),
        eq(emailMessages.triageState, "pending")
      )
    )
  const otherThreads = [...new Set(otherPending.map((r) => r.threadId))]
  for (const threadId of otherThreads) {
    await promoteThreadToCase(tx, contact, threadId)
  }

  return { caseId: caseRow?.id ?? null, contactId: contact.id }
  })
}
