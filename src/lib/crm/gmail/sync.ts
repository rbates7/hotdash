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

import { isGoogleNotFound } from "./errors"
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
    skippedMissing: 0,
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

/** Gmail list query for "Catch up since last sync" (`after:` takes epoch seconds). */
export function gmailCatchUpListQuery(afterEpochSeconds: number): string {
  return `-in:chat after:${Math.floor(afterEpochSeconds)}`
}

const GMAIL_BACKFILL_PAGE_TOKEN_KEY = "gmail_backfill_page_token"
const GMAIL_BACKFILL_HISTORY_ID_KEY = "gmail_backfill_history_id"
const GMAIL_CATCHUP_PAGE_TOKEN_KEY = "gmail_catchup_page_token"
const GMAIL_CATCHUP_HISTORY_ID_KEY = "gmail_catchup_history_id"
const GMAIL_CATCHUP_AFTER_KEY = "gmail_catchup_after"

/** Catch-up looks back this far before the last success, in case that run missed a few. */
const CATCHUP_OVERLAP_SECONDS = 60 * 60
const CATCHUP_TIME_BUDGET_MS = 120_000

export async function clearGmailBackfillProgress(db: Db) {
  await deleteSetting(db, GMAIL_BACKFILL_PAGE_TOKEN_KEY)
  await deleteSetting(db, GMAIL_BACKFILL_HISTORY_ID_KEY)
}

async function clearGmailCatchUpProgress(db: Db) {
  await deleteSetting(db, GMAIL_CATCHUP_PAGE_TOKEN_KEY)
  await deleteSetting(db, GMAIL_CATCHUP_HISTORY_ID_KEY)
  await deleteSetting(db, GMAIL_CATCHUP_AFTER_KEY)
}

/**
 * Lists one Gmail page of the backfill window. The next page token is only
 * saved once this page's messages are stored (see `syncGmail`), so a run that
 * dies mid-page redoes that page instead of skipping it.
 */
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
  return {
    ids: page.ids,
    newCursor: backfillPending ? null : historyId,
    backfillPending,
    commit: async () => {
      if (page.nextPageToken) {
        await setSetting(db, GMAIL_BACKFILL_PAGE_TOKEN_KEY, page.nextPageToken)
      } else {
        await clearGmailBackfillProgress(db)
      }
    },
  }
}

/**
 * Fetches full messages. A message Gmail no longer has (404: a deleted draft
 * or purged mail that history still lists) is skipped and logged instead of
 * failing the whole run, which would otherwise pin the cursor forever.
 */
async function fetchMessages(
  api: GmailApi,
  ids: string[],
  concurrency: number,
  stats: GmailSyncStats
): Promise<GmailRawMessage[]> {
  const results = await mapWithConcurrency(ids, concurrency, async (id) => {
    try {
      return await api.getMessage(id)
    } catch (error) {
      if (!isGoogleNotFound(error)) throw error
      console.warn(
        `[crm gmail] users.messages.get returned 404 for message ${id}; skipping it.`
      )
      stats.skippedMissing += 1
      return null
    }
  })
  return results.filter((raw): raw is GmailRawMessage => raw !== null)
}

async function processMessageIds(
  db: Db,
  api: GmailApi,
  founderAddresses: Set<string>,
  ids: string[],
  concurrency: number,
  stats: GmailSyncStats
) {
  const rawMessages = await fetchMessages(api, ids, concurrency, stats)
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

function founderAddressSet(accountEmail: string, aliases: string[] = []) {
  return new Set(
    [accountEmail, ...aliases].map((a) => a.trim().toLowerCase())
  )
}

async function saveGmailSuccess(db: Db, cursor: string | null) {
  const now = new Date()
  await db.insert(syncState)
    .values({
      source: "gmail",
      cursor,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: { cursor, lastSyncedAt: now, updatedAt: now },
    })
}

export async function syncGmail(
  db: Db,
  api: GmailApi,
  accountEmail: string,
  options: GmailSyncOptions = {}
): Promise<GmailSyncStats> {
  const stats = emptyStats()
  const founderAddresses = founderAddressSet(accountEmail, options.founderAliases)
  const initialWindow = options.initialWindow ?? "30d"

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .limit(1)

  let ids: string[]
  let newCursor: string | null
  let backfillPending = 0
  let commit: (() => Promise<void>) | undefined
  if (state?.cursor) {
    try {
      ;({ ids, newCursor } = await collectIncrementalIds(api, state.cursor))
    } catch (error) {
      if (!(error instanceof HistoryExpiredError)) throw error
      // Switch to a backfill exactly once: drop the expired cursor now so
      // later runs resume the backfill from its saved page instead of
      // hitting the expired cursor and restarting from page one.
      await db.update(syncState)
        .set({ cursor: null, updatedAt: new Date() })
        .where(eq(syncState.source, "gmail"))
      await clearGmailBackfillProgress(db)
      ;({ ids, newCursor, backfillPending, commit } = await collectFullSyncBatch(
        db,
        api,
        initialWindow
      ))
    }
  } else {
    ;({ ids, newCursor, backfillPending, commit } = await collectFullSyncBatch(
      db,
      api,
      initialWindow
    ))
  }

  await processMessageIds(
    db,
    api,
    founderAddresses,
    ids,
    options.fetchConcurrency ?? 5,
    stats
  )

  await commit?.()
  await saveGmailSuccess(db, newCursor)

  if (backfillPending) stats.backfillPending = backfillPending
  return stats
}

export class GmailNeverSyncedError extends Error {
  constructor() {
    super(
      "Gmail has never synced successfully, so there is no last sync to catch up from. Use Sync now for the first import."
    )
    this.name = "GmailNeverSyncedError"
  }
}

export type GmailCatchUpOptions = GmailSyncOptions & {
  /** Stop listing new pages after this long; the next click resumes. */
  timeBudgetMs?: number
}

/**
 * "Catch up since last sync": pulls every message Gmail search finds after
 * the last successful sync (minus a short overlap), without the history
 * cursor. When done it resets the cursor to the mailbox historyId read before
 * listing, so regular syncs carry on from there. Messages already stored are
 * skipped, so overlap and repeat clicks are safe.
 */
export async function catchUpGmail(
  db: Db,
  api: GmailApi,
  accountEmail: string,
  options: GmailCatchUpOptions = {}
): Promise<GmailSyncStats> {
  const stats = emptyStats()
  const founderAddresses = founderAddressSet(accountEmail, options.founderAliases)
  const budgetMs = options.timeBudgetMs ?? CATCHUP_TIME_BUDGET_MS

  let after = await getSetting(db, GMAIL_CATCHUP_AFTER_KEY)
  let historyId = await getSetting(db, GMAIL_CATCHUP_HISTORY_ID_KEY)
  if (!after || !historyId) {
    const [state] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .limit(1)
    if (!state?.lastSyncedAt) throw new GmailNeverSyncedError()
    await clearGmailCatchUpProgress(db)
    after = String(
      Math.floor(state.lastSyncedAt.getTime() / 1000) - CATCHUP_OVERLAP_SECONDS
    )
    // Read before listing: anything that arrives mid-catch-up is picked up
    // by the next regular sync from this point.
    historyId = (await api.getProfile()).historyId
    await setSetting(db, GMAIL_CATCHUP_AFTER_KEY, after)
    await setSetting(db, GMAIL_CATCHUP_HISTORY_ID_KEY, historyId)
  }

  const query = gmailCatchUpListQuery(Number(after))
  let pageToken =
    (await getSetting(db, GMAIL_CATCHUP_PAGE_TOKEN_KEY)) ?? undefined
  const startedAt = Date.now()
  do {
    const page = await api.listMessageIds({ q: query, pageToken })
    await processMessageIds(
      db,
      api,
      founderAddresses,
      page.ids,
      options.fetchConcurrency ?? 5,
      stats
    )
    pageToken = page.nextPageToken
    if (pageToken) await setSetting(db, GMAIL_CATCHUP_PAGE_TOKEN_KEY, pageToken)
  } while (pageToken && Date.now() - startedAt < budgetMs)

  if (pageToken) {
    stats.catchUpPending = 1
    return stats
  }

  await saveGmailSuccess(db, historyId)
  await clearGmailCatchUpProgress(db)
  // The fresh cursor supersedes any half-finished backfill.
  await clearGmailBackfillProgress(db)
  return stats
}
