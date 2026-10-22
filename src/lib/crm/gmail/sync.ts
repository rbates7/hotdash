import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { cleanSubject } from "@/lib/crm/cases/rules"
import {
  applyMessageToCase,
  createCaseForThread,
  getCaseByThreadId,
} from "@/lib/crm/cases/server"
import { findContactByEmail } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"
import {
  cases,
  emailMessages,
  ignoredSenders,
  syncState,
} from "@/lib/crm/db/schema"
import {
  deleteSetting,
  getSetting,
  setSetting,
} from "@/lib/crm/settings/server"

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

async function messageExists(db: Db, gmailMessageId: string) {
  const rows = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, gmailMessageId))
      .limit(1)
  return rows.length > 0
}

async function senderIgnored(db: Db, email: string) {
  const rows = await db
      .select()
      .from(ignoredSenders)
      .where(eq(ignoredSenders.email, email))
      .limit(1)
  return rows.length > 0
}

async function storeMessage(
  db: Db,
  parsed: ParsedMessage,
  target:
    | { kind: "case"; caseId: string }
    | { kind: "triage" }
): Promise<boolean> {
  const inserted = await db
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
    .returning({ id: emailMessages.id })
  return inserted.length > 0
}

async function attachToCase(db: Db, caseId: string, parsed: ParsedMessage) {
  const stored = await storeMessage(db, parsed, { kind: "case", caseId })
  if (!stored) return false
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1)
  if (caseRow) {
    await applyMessageToCase(db, caseRow, {
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
  return db.transaction(async (tx) => {
    const existing = await getCaseByThreadId(tx, seedMessage.gmailThreadId)
    const caseRow =
      existing ??
      (await createCaseForThread(tx, {
        contactId,
        subject: cleanSubject(seedMessage.subject),
        gmailThreadId: seedMessage.gmailThreadId,
        createdAt: seedMessage.sentAt,
      }))
    if (!existing) stats.casesCreated += 1

    const seen = new Set<string>()
    for (const message of all) {
      if (seen.has(message.gmailMessageId)) continue
      seen.add(message.gmailMessageId)
      const stored = await attachToCase(tx, caseRow.id, message)
      if (stored) {
        stats.stored += 1
        if (message.gmailMessageId !== seedMessage.gmailMessageId) {
          stats.backfilled += 1
        }
      }
    }
    return caseRow
  })
}

export async function processParsedMessage(
  db: Db,
  api: Pick<GmailApi, "getThread">,
  founderAddresses: Set<string>,
  parsed: ParsedMessage,
  stats: GmailSyncStats
) {
  if (await messageExists(db, parsed.gmailMessageId)) return

  const existingCase = await getCaseByThreadId(db, parsed.gmailThreadId)
  if (existingCase) {
    if (await attachToCase(db, existingCase.id, parsed)) stats.stored += 1
    return
  }

  if (parsed.direction === "outbound") {
    // Founder-initiated mail without a case isn't support traffic; if the
    // recipient ever replies, thread backfill recovers this half.
    return
  }

  if (await senderIgnored(db, parsed.fromEmail)) return

  const contact = await findContactByEmail(db, parsed.fromEmail)
  if (contact) {
    await createCaseWithBackfill(db, api, founderAddresses, contact.id, parsed, stats)
    return
  }

  if (parsed.isBulk) {
    stats.skippedBulk += 1
    return
  }

  if (await storeMessage(db, parsed, { kind: "triage" })) {
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

/** Gmail list query for a full backfill (`30d`, `120d`, or `after:2026/07/01`). */
export function gmailFullSyncListQuery(initialWindow: string): string {
  const window = initialWindow.trim()
  const timeFilter = window.startsWith("after:")
    ? window
    : `newer_than:${window}`
  return `-in:chat ${timeFilter}`
}

const GMAIL_BACKFILL_PAGE_TOKEN_KEY = "gmail_backfill_page_token"
const GMAIL_BACKFILL_HISTORY_ID_KEY = "gmail_backfill_history_id"

export async function clearGmailBackfillProgress(db: Db) {
  await deleteSetting(db, GMAIL_BACKFILL_PAGE_TOKEN_KEY)
  await deleteSetting(db, GMAIL_BACKFILL_HISTORY_ID_KEY)
}

/** Lists and processes one Gmail page per run to stay under quota and time limits. */
async function collectFullSyncBatch(
  db: Db,
  api: GmailApi,
  initialWindow: string
) {
  let historyId = await getSetting(db, GMAIL_BACKFILL_HISTORY_ID_KEY)
  if (!historyId) {
    const profile = await api.getProfile()
    historyId = profile.historyId
    await setSetting(db, GMAIL_BACKFILL_HISTORY_ID_KEY, historyId)
  }

  const savedToken = await getSetting(db, GMAIL_BACKFILL_PAGE_TOKEN_KEY)
  const page = await api.listMessageIds({
    q: gmailFullSyncListQuery(initialWindow),
    pageToken: savedToken ?? undefined,
  })

  const backfillPending = page.nextPageToken ? 1 : 0
  if (page.nextPageToken) {
    await setSetting(db, GMAIL_BACKFILL_PAGE_TOKEN_KEY, page.nextPageToken)
  } else {
    await clearGmailBackfillProgress(db)
  }

  return {
    ids: page.ids,
    newCursor: backfillPending ? null : historyId,
    backfillPending,
  }
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

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .limit(1)

  let ids: string[]
  let newCursor: string | null
  let backfillPending = 0
  if (state?.cursor) {
    try {
      ;({ ids, newCursor } = await collectIncrementalIds(api, state.cursor))
    } catch (error) {
      if (error instanceof HistoryExpiredError) {
        await clearGmailBackfillProgress(db)
        ;({ ids, newCursor, backfillPending } = await collectFullSyncBatch(
          db,
          api,
          initialWindow
        ))
      } else {
        throw error
      }
    }
  } else {
    ;({ ids, newCursor, backfillPending } = await collectFullSyncBatch(
      db,
      api,
      initialWindow
    ))
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
  await db.insert(syncState)
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

  if (backfillPending) stats.backfillPending = backfillPending
  return stats
}
