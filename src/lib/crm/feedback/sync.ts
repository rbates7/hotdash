import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import postgres from "postgres"

import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/crm/cases/server"
import { normalizeEmail } from "@/lib/crm/contacts/matching"
import { createContact, findContactByEmail } from "@/lib/crm/contacts/server"
import { rawClient, type Db } from "@/lib/crm/db/client"
import { emailMessages } from "@/lib/crm/db/schema"
import { subjectFromForm } from "@/lib/crm/gmail/parse"
import {
  feedbackMapping,
  type SupabaseFeedbackRow,
} from "@/lib/crm/supabase/mapping"

import { feedbackKey } from "./keys"

export interface FeedbackSource {
  fetchRows(limit: number, offset: number): Promise<SupabaseFeedbackRow[]>
  close(): Promise<void>
}

/** Same connection as the enrichment sync; absent env = feedback off. */
export function createFeedbackSource(): FeedbackSource | null {
  const url = process.env.SUPABASE_DB_URL
  if (!url) return null
  const sql = postgres(url, { max: 1, prepare: false })
  return {
    async fetchRows(limit, offset) {
      // Oldest first with a stable tiebreak, so paging never skips a row
      // and case numbers follow the order feedback arrived in.
      const rows = await sql.unsafe(
        `select * from (${feedbackMapping.query}) as feedback order by created_at, id limit $1 offset $2`,
        [limit, offset]
      )
      return rows as unknown as SupabaseFeedbackRow[]
    },
    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}

export type FeedbackSyncStats = {
  rowsSeen: number
  casesCreated: number
  contactsCreated: number
  /** Already stored, or missing an email, or neither words nor a score. */
  skipped: number
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The chance-to-recommend number as the form recorded it, or null. Its
 * scale is not confirmed yet, so it is shown as given ("Rated 8"); once
 * it is, this is where a denominator and an unhappy flag belong. */
export function feedbackScore(value: unknown): number | null {
  if (value == null || value === "") return null
  const score = Number(value)
  return Number.isFinite(score) ? score : null
}

/** The case subject: the score when there is one, then the first words of
 * what they wrote — the same cut the contact form gets. */
export function feedbackSubject(
  message: string | null | undefined,
  score: number | null
): string {
  const words = message?.trim() ? subjectFromForm(message) : null
  if (score !== null && words) return `Rated ${score} · ${words}`
  if (score !== null) return `Rated ${score}`
  return words ?? "In-app feedback"
}

/** What is stored as the message: the score on its own line above the
 * words, so the case page shows both. */
export function feedbackBody(
  message: string | null | undefined,
  score: number | null
): string {
  const text = message?.trim() ?? ""
  if (score === null) return text
  if (!text) return `Gave a score of ${score} and no comment.`
  return `Chance to recommend: ${score}\n\n${text}`
}

const PAGE_SIZE = 500

/**
 * Feedback sent from inside the Chlk app becomes a case, so it sits in the
 * same queue as email and counts as needing a reply. A score with no words
 * still opens one — Rashad wants to follow up with everyone. Each row is
 * stored as one inbound message keyed by its feedback id, which makes the
 * sync idempotent and self-healing: a row already stored is skipped, and a
 * case that somehow lost its message gets it back.
 */
export async function syncFeedback(
  db: Db,
  source: FeedbackSource
): Promise<FeedbackSyncStats> {
  const stats: FeedbackSyncStats = {
    rowsSeen: 0,
    casesCreated: 0,
    contactsCreated: 0,
    skipped: 0,
  }
  const store = rawClient(db).transaction((row: SupabaseFeedbackRow) => {
    const email = normalizeEmail(row.email!)
    const score = feedbackScore(row.score)
    const body = feedbackBody(row.message, score)
    const key = feedbackKey(String(row.id))
    const sentAt = toDate(row.created_at) ?? new Date()

    let contact = findContactByEmail(db, email)
    if (!contact) {
      contact = createContact(db, {
        email,
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        nameSource: "supabase",
        source: "supabase",
      })
      stats.contactsCreated += 1
    }
    const fromName =
      [row.first_name, row.last_name].filter(Boolean).join(" ") || null

    let caseRow = getCaseByThreadId(db, key)
    if (!caseRow) {
      caseRow = createCaseForThread(db, {
        contactId: contact.id,
        subject: feedbackSubject(row.message, score),
        gmailThreadId: key,
        createdAt: sentAt,
      })
      stats.casesCreated += 1
    }

    db.insert(emailMessages)
      .values({
        id: randomUUID(),
        channel: "feedback",
        gmailMessageId: key,
        gmailThreadId: key,
        caseId: caseRow.id,
        direction: "inbound",
        fromEmail: email,
        fromName,
        toEmails: [],
        ccEmails: [],
        subject: caseRow.subject,
        snippet: body.replace(/\s+/g, " ").slice(0, 120),
        bodyText: body,
        bodyHtml: null,
        attachments: [],
        sentAt,
        createdAt: new Date(),
      })
      .run()
    applyMessageToCase(db, caseRow, {
      direction: "inbound",
      sentAt,
      fromName,
      fromEmail: email,
    })
  })

  let offset = 0
  for (;;) {
    const rows = await source.fetchRows(PAGE_SIZE, offset)
    if (rows.length === 0) break
    for (const row of rows) {
      stats.rowsSeen += 1
      const hasWords = Boolean(row.message?.trim())
      const hasScore = feedbackScore(row.score) !== null
      if (row.id == null || !row.email || (!hasWords && !hasScore)) {
        stats.skipped += 1
        continue
      }
      const stored = db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(eq(emailMessages.gmailMessageId, feedbackKey(String(row.id))))
        .get()
      if (stored) {
        stats.skipped += 1
        continue
      }
      store(row)
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return stats
}
