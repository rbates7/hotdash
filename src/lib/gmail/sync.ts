import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { cleanSubject } from "@/lib/cases/rules"
import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/cases/server"
import { findContactByEmail } from "@/lib/contacts/server"
import type { Db } from "@/lib/db/client"
import {
  cases,
  emailMessages,
  ignoredSenders,
  syncState,
} from "@/lib/db/schema"

import { isExcludedByLabels, parseMessage } from "./parse"
import type {
  GmailApi,
  GmailRawMessage,
  GmailSyncStats,
  ParsedMessage,
} from "./types"
import { HistoryExpiredError } from "./types"

export type GmailSyncOptions = {
  founderAliases?: string[]
  initialWindow?: string
  fetchConcurrency?: number
}

function emptyStats(): GmailSyncStats {
  return {
    fetched: 0,
    stored: 0,
    casesCreated: 0,
    triaged: 0,
    skippedBulk: 0,
    backfilled: 0,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        results[index] = await fn(items[index]!)
      }
    }
  )
  await Promise.all(workers)
  return results
}

function messageExists(db: Db, gmailMessageId: string) {
  return (
    db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, gmailMessageId))
      .get() !== undefined
  )
}

function senderIgnored(db: Db, email: string) {
  return (
    db
      .select()
      .from(ignoredSenders)
      .where(eq(ignoredSenders.email, email))
      .get() !== undefined
  )
}

function storeMessage(
  db: Db,
  parsed: ParsedMessage,
  target:
    | { kind: "case"; caseId: string }
    | { kind: "triage" }
): boolean {
  const inserted = db
    .insert(emailMessages)
    .values({
      id: randomUUID(),
      gmailMessageId: parsed.gmailMessageId,
      gmailThreadId: parsed.gmailThreadId,
      caseId: target.kind === "case" ? target.caseId : null,
      triageState: target.kind === "triage" ? "pending" : null,
      direction: parsed.direction,
      fromEmail: parsed.fromEmail,
      fromName: parsed.fromName,
      toEmails: parsed.toEmails,
      ccEmails: parsed.ccEmails,
      subject: parsed.subject,
      snippet: parsed.snippet,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      attachments: parsed.attachments,
      sentAt: parsed.sentAt,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: emailMessages.gmailMessageId })
    .run()
  return inserted.changes > 0
}

function attachToCase(db: Db, caseId: string, parsed: ParsedMessage) {
  const stored = storeMessage(db, parsed, { kind: "case", caseId })
  if (!stored) return false
  const caseRow = db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (caseRow) {
    applyMessageToCase(db, caseRow, {
      direction: parsed.direction,
      sentAt: parsed.sentAt,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
    })
  }
  return true
}

// Creates the case for a thread and pulls in the WHOLE thread so history
// (including the founder's earlier replies) lands in the timeline even when
// the thread is discovered mid-conversation.
export async function createCaseWithBackfill(
  db: Db,
  api: Pick<GmailApi, "getThread">,
  founderAddresses: Set<string>,
  contactId: string,
  seedMessage: ParsedMessage,
  stats: GmailSyncStats
) {
  const caseRow = createCaseForThread(db, {
    contactId,
    subject: cleanSubject(seedMessage.subject),
    gmailThreadId: seedMessage.gmailThreadId,
    createdAt: seedMessage.sentAt,
  })
  stats.casesCreated += 1

  let threadMessages: GmailRawMessage[] = []
  try {
    threadMessages = (await api.getThread(seedMessage.gmailThreadId)).messages
  } catch {
    // Thread fetch is best-effort; the seed message alone still forms the case.
    threadMessages = []
  }

  const parsedThread = threadMessages
    .map((raw) => parseMessage(raw, founderAddresses))
    .filter((m): m is ParsedMessage => m !== null)
    .filter((m) => !isExcludedByLabels(m.labelIds))

  const all = [seedMessage, ...parsedThread].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  )
  const seen = new Set<string>()
  for (const message of all) {
    if (seen.has(message.gmailMessageId)) continue
    seen.add(message.gmailMessageId)
    const stored = attachToCase(db, caseRow.id, message)
    if (stored) {
      stats.stored += 1
      if (message.gmailMessageId !== seedMessage.gmailMessageId) {
        stats.backfilled += 1
      }
    }
  }
  return caseRow
}

export async function processParsedMessage(
  db: Db,
  api: Pick<GmailApi, "getThread">,
  founderAddresses: Set<string>,
  parsed: ParsedMessage,
  stats: GmailSyncStats
) {
  if (messageExists(db, parsed.gmailMessageId)) return

  const existingCase = getCaseByThreadId(db, parsed.gmailThreadId)
  if (existingCase) {
    if (attachToCase(db, existingCase.id, parsed)) stats.stored += 1
    return
  }

  if (parsed.direction === "outbound") {
    // Founder-initiated mail without a case isn't support traffic; if the
    // recipient ever replies, thread backfill recovers this half.
    return
  }

  if (senderIgnored(db, parsed.fromEmail)) return

  const contact = findContactByEmail(db, parsed.fromEmail)
  if (contact) {
    await createCaseWithBackfill(db, api, founderAddresses, contact.id, parsed, stats)
    return
  }

  if (parsed.isBulk) {
    stats.skippedBulk += 1
    return
  }

  if (storeMessage(db, parsed, { kind: "triage" })) {
    stats.stored += 1
    stats.triaged += 1
  }
}

async function collectIncrementalIds(api: GmailApi, cursor: string) {
  const ids = new Set<string>()
  let pageToken: string | undefined
  let newCursor: string | null = null
  do {
    const page = await api.listHistory({ startHistoryId: cursor, pageToken })
    for (const id of page.messageIds) ids.add(id)
    if (page.historyId) newCursor = page.historyId
    pageToken = page.nextPageToken
  } while (pageToken)
  return { ids: [...ids], newCursor }
}

async function collectFullSyncIds(api: GmailApi, initialWindow: string) {
  // Capture the profile historyId BEFORE listing: anything that arrives
  // mid-backfill is replayed by the next incremental pass and deduped.
  const profile = await api.getProfile()
  const ids = new Set<string>()
  let pageToken: string | undefined
  do {
    const page = await api.listMessageIds({
      q: `-in:chat newer_than:${initialWindow}`,
      pageToken,
    })
    for (const id of page.ids) ids.add(id)
    pageToken = page.nextPageToken
  } while (pageToken)
  return { ids: [...ids], newCursor: profile.historyId }
}

export async function syncGmail(
  db: Db,
  api: GmailApi,
  accountEmail: string,
  options: GmailSyncOptions = {}
): Promise<GmailSyncStats> {
  const stats = emptyStats()
  const founderAddresses = new Set(
    [accountEmail, ...(options.founderAliases ?? [])].map((a) =>
      a.trim().toLowerCase()
    )
  )
  const initialWindow = options.initialWindow ?? "30d"

  const state = db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .get()

  let ids: string[]
  let newCursor: string | null
  if (state?.cursor) {
    try {
      ;({ ids, newCursor } = await collectIncrementalIds(api, state.cursor))
    } catch (error) {
      if (error instanceof HistoryExpiredError) {
        ;({ ids, newCursor } = await collectFullSyncIds(api, initialWindow))
      } else {
        throw error
      }
    }
  } else {
    ;({ ids, newCursor } = await collectFullSyncIds(api, initialWindow))
  }

  const rawMessages = await mapWithConcurrency(
    ids,
    options.fetchConcurrency ?? 5,
    (id) => api.getMessage(id)
  )
  stats.fetched = rawMessages.length

  const parsed = rawMessages
    .filter((raw) => !isExcludedByLabels(raw.labelIds))
    .map((raw) => parseMessage(raw, founderAddresses))
    .filter((m): m is ParsedMessage => m !== null)
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())

  for (const message of parsed) {
    await processParsedMessage(db, api, founderAddresses, message, stats)
  }

  const now = new Date()
  db.insert(syncState)
    .values({
      source: "gmail",
      cursor: newCursor,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: { cursor: newCursor, lastSyncedAt: now, updatedAt: now },
    })
    .run()

  return stats
}
