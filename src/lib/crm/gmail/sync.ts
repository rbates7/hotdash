import { randomUUID } from "node:crypto"

import { eq, inArray } from "drizzle-orm"

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
  type Case,
} from "@/lib/crm/db/schema"

import { isExcludedByLabels, parseMessage } from "./parse"
import { DEFAULT_SYNC_WINDOW, syncWindowQuery } from "./window"
import type {
  GmailApi,
  GmailRawMessage,
  GmailSyncStats,
  ParsedMessage,
} from "./types"
import { HistoryExpiredError, MessageNotFoundError } from "./types"

// Gmail allows 250 quota units per user per second and messages.get costs 5,
// so this leaves room for the thread fetches a new case triggers alongside.
const DEFAULT_FETCH_CONCURRENCY = 4
const FETCH_CHUNK = 100

export type GmailSyncOptions = {
  founderAliases?: string[]
  initialWindow?: string
  fetchConcurrency?: number
  /** Messages fetched and stored per pass; smaller loses less on a failure. */
  fetchChunk?: number
  /** Only mail you sent, over the initial window, without touching the
   * history cursor: the one-off import of what you started before the
   * sync was keeping it. */
  sentOnly?: boolean
}

function emptyStats(): GmailSyncStats {
  return {
    fetched: 0,
    stored: 0,
    casesCreated: 0,
    triaged: 0,
    skippedBulk: 0,
    backfilled: 0,
    missing: 0,
    outreach: 0,
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

/**
 * Which of these are already stored. Checked before fetching rather than
 * after, so a backfill that stopped part way does not pay Gmail again for
 * everything it already has — which is what makes a resumed run cheap enough
 * to be worth resuming.
 */
function storedMessageIds(db: Db, ids: string[]): Set<string> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select({ id: emailMessages.gmailMessageId })
      .from(emailMessages)
      .where(inArray(emailMessages.gmailMessageId, ids.slice(i, i + 400)))
      .all()
    for (const row of rows) found.add(row.id)
  }
  return found
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
    | { kind: "case"; caseId: string; contactId: string }
    | { kind: "contact"; contactId: string }
    | { kind: "triage" }
): boolean {
  const inserted = db
    .insert(emailMessages)
    .values({
      id: randomUUID(),
      gmailMessageId: parsed.gmailMessageId,
      gmailThreadId: parsed.gmailThreadId,
      caseId: target.kind === "case" ? target.caseId : null,
      contactId: target.kind === "triage" ? null : target.contactId,
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

function attachToCase(
  db: Db,
  target: Pick<Case, "id" | "contactId">,
  parsed: ParsedMessage
) {
  const caseId = target.id
  const stored = storeMessage(db, parsed, {
    kind: "case",
    caseId,
    contactId: target.contactId,
  })
  if (!stored) {
    // Already stored — as a pending triage item this thread is now
    // claiming, or as mail you started before they replied. Adopt it into
    // the case rather than dropping it, or the conversation's opening
    // message never reaches the timeline.
    const existing = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, parsed.gmailMessageId))
      .get()
    if (!existing || existing.caseId === caseId) return false
    db.update(emailMessages)
      .set({ caseId, contactId: target.contactId, triageState: null })
      .where(eq(emailMessages.id, existing.id))
      .run()
  }
  // Read the case fresh: each message moves its status, and the next one
  // must transition from where the last one left it.
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

/** The first person on To or Cc the CRM already knows. */
function findRecipientContact(db: Db, parsed: ParsedMessage) {
  for (const email of [...parsed.toEmails, ...parsed.ccEmails]) {
    const contact = findContactByEmail(db, email)
    if (contact) return contact
  }
  return undefined
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
    const stored = attachToCase(db, caseRow, message)
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
    if (attachToCase(db, existingCase, parsed)) stats.stored += 1
    return
  }

  if (parsed.direction === "outbound") {
    // Mail you started. Not support traffic, so no case — but sent to
    // someone the CRM knows it is outreach, which the Overview's "reached
    // out" tick and the "Last emailed" column are built on, so it is kept
    // with the person. If they reply, the case their reply opens adopts
    // it. To a stranger, it is ignored.
    const recipient = findRecipientContact(db, parsed)
    if (
      recipient &&
      storeMessage(db, parsed, { kind: "contact", contactId: recipient.id })
    ) {
      stats.stored += 1
      stats.outreach += 1
    }
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

async function collectFullSyncIds(
  api: GmailApi,
  initialWindow: string,
  sentOnly = false
) {
  // Capture the profile historyId BEFORE listing: anything that arrives
  // mid-backfill is replayed by the next incremental pass and deduped.
  const profile = await api.getProfile()
  const ids = new Set<string>()
  // A malformed window must not take the whole backfill down with it, so fall
  // back to the default rather than throwing. `pnpm crm:doctor` rejects a bad
  // value up front, which is where a typo should surface.
  let windowQuery = syncWindowQuery(initialWindow)
  if (!windowQuery) {
    console.warn(
      `[gmail] ignoring malformed GMAIL_INITIAL_SYNC_WINDOW; using ${DEFAULT_SYNC_WINDOW}`
    )
    windowQuery = syncWindowQuery(DEFAULT_SYNC_WINDOW)!
  }
  let pageToken: string | undefined
  do {
    const page = await api.listMessageIds({
      q: `${sentOnly ? "in:sent " : ""}-in:chat ${windowQuery}`,
      pageToken,
    })
    for (const id of page.ids) ids.add(id)
    pageToken = page.nextPageToken
  } while (pageToken)
  // messages.list returns newest first. Chunked processing makes that order
  // observable, and a case reads better built forward from its first message.
  return { ids: [...ids].reverse(), newCursor: profile.historyId }
}

/**
 * Drop the stored history cursor so the next sync takes the full-sync path
 * again. Without this, widening GMAIL_INITIAL_SYNC_WINDOW after the first
 * successful sync does nothing at all — the window is only consulted when
 * there is no cursor, so the setting silently has no effect and the mail you
 * asked for never arrives.
 */
export function resetGmailCursor(db: Db) {
  db.delete(syncState).where(eq(syncState.source, "gmail")).run()
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
  const initialWindow = options.initialWindow ?? DEFAULT_SYNC_WINDOW

  const state = db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .get()

  let ids: string[]
  let newCursor: string | null
  if (options.sentOnly) {
    // Your sent mail over the window, nothing else, and the cursor is left
    // exactly as it was: this is an import, not a sync.
    ;({ ids } = await collectFullSyncIds(api, initialWindow, true))
    newCursor = null
  } else if (state?.cursor) {
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

  const alreadyStored = storedMessageIds(db, ids)
  const pending = ids.filter((id) => !alreadyStored.has(id))
  const concurrency = options.fetchConcurrency ?? DEFAULT_FETCH_CONCURRENCY

  // Fetch and store in chunks rather than gathering every message first. A
  // months-long backfill is tens of thousands of messages, and doing it in one
  // pass meant a rate limit near the end discarded all of it. Each chunk is
  // durable on its own, and the id filter above lets a re-run skip it.
  const chunkSize = options.fetchChunk ?? FETCH_CHUNK
  for (let i = 0; i < pending.length; i += chunkSize) {
    const rawMessages = (
      await mapWithConcurrency(
        pending.slice(i, i + chunkSize),
        concurrency,
        async (id) => {
          try {
            return await api.getMessage(id)
          } catch (error) {
            // Deleted between Gmail listing it and us asking for it. Gone
            // for good, so give up on the message, not on the run.
            if (error instanceof MessageNotFoundError) {
              stats.missing += 1
              return null
            }
            throw error
          }
        }
      )
    ).filter((raw): raw is GmailRawMessage => raw !== null)
    stats.fetched += rawMessages.length

    const parsed = rawMessages
      .filter((raw) => !isExcludedByLabels(raw.labelIds))
      .map((raw) => parseMessage(raw, founderAddresses))
      .filter((m): m is ParsedMessage => m !== null)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())

    for (const message of parsed) {
      await processParsedMessage(db, api, founderAddresses, message, stats)
    }
  }

  if (options.sentOnly) return stats

  const now = new Date()
  // Keep the previous cursor when Gmail returns no history id; overwriting
  // it with null would trigger a full window re-sync on every tick.
  const cursorToStore = newCursor ?? state?.cursor ?? null
  db.insert(syncState)
    .values({
      source: "gmail",
      cursor: cursorToStore,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: { cursor: cursorToStore, lastSyncedAt: now, updatedAt: now },
    })
    .run()

  return stats
}
