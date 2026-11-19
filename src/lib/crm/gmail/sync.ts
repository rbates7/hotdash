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

import { isGoogleNotFound, isGoogleRateLimited } from "./errors"
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
  /** Cap on users.messages.get successes per run. Default 100. */
  maxMessagesPerRun?: number
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

type NewestMessage = { date: Date | null }

function logGmailRun(
  stats: GmailSyncStats,
  cursor: string | null,
  more: boolean,
  newest: Date | null
) {
  const newestIso = newest ? newest.toISOString() : "none"
  console.info(
    `[crm sync] gmail run: fetched ${stats.fetched}, skipped ${stats.skippedMissing}, cursor advanced to ${cursor ?? "none"}, more=${more}, newest message date=${newestIso}`
  )
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

/** How many users.messages.get calls run at once. Kept small so a
 * catch-up does not blow Gmail's per-user query-cost quota. */
export const DEFAULT_GMAIL_FETCH_CONCURRENCY = 3
/** Successful users.messages.get calls allowed in one run before we stop and save. */
export const DEFAULT_GMAIL_MAX_MESSAGES_PER_RUN = 100
const RATE_LIMIT_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 2_000
const RATE_LIMIT_MAX_DELAY_MS = 16_000
// Stay well under the sync route's maxDuration (300s).
const RATE_LIMIT_BUDGET_MS = 90_000

/** Test hook so the retry test does not wait on real timers. */
export const gmailRateLimitRetry = {
  sleep: (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
}

function rateLimitDelayMs(attempt: number): number {
  const exp = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt
  const jitter = Math.floor(Math.random() * RATE_LIMIT_BASE_DELAY_MS)
  return Math.min(exp + jitter, RATE_LIMIT_MAX_DELAY_MS)
}

async function getMessageRespectingQuota(
  api: GmailApi,
  id: string,
  budget: { remainingMs: number }
): Promise<GmailRawMessage> {
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await api.getMessage(id)
    } catch (error) {
      if (!isGoogleRateLimited(error) || attempt === RATE_LIMIT_RETRIES) {
        throw error
      }
      const delay = Math.min(rateLimitDelayMs(attempt), budget.remainingMs)
      if (delay <= 0) throw error
      console.warn(
        `[crm gmail] users.messages.get hit a rate limit for message ${id}; retrying in ${delay}ms.`
      )
      budget.remainingMs -= delay
      await gmailRateLimitRetry.sleep(delay)
    }
  }
  throw new Error("unreachable")
}

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
  const budget = { remainingMs: RATE_LIMIT_BUDGET_MS }
  const results = await mapWithConcurrency(ids, concurrency, async (id) => {
    try {
      return await getMessageRespectingQuota(api, id, budget)
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
  stats: GmailSyncStats,
  cap: number,
  newest: NewestMessage
): Promise<{ complete: boolean }> {
  const pending: string[] = []
  for (const id of ids) {
    if (await messageExists(db, id)) continue
    pending.push(id)
  }

  let index = 0
  while (index < pending.length) {
    if (stats.fetched >= cap) return { complete: false }
    const room = cap - stats.fetched
    const chunkSize = Math.min(concurrency, room, pending.length - index)
    const chunk = pending.slice(index, index + chunkSize)
    const rawMessages = await fetchMessages(api, chunk, concurrency, stats)
    stats.fetched += rawMessages.length

    const parsed = rawMessages
      .filter((raw) => !isExcludedByLabels(raw.labelIds))
      .map((raw) => parseMessage(raw, founderAddresses))
      .filter((m): m is ParsedMessage => m !== null)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())

    for (const message of parsed) {
      if (!newest.date || message.sentAt > newest.date) newest.date = message.sentAt
      await processParsedMessage(db, api, founderAddresses, message, stats)
    }
    index += chunk.length
  }
  return { complete: true }
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

/** Advance the history cursor without touching lastSyncedAt. Used for
 * partial runs so "Catch up since last sync" still starts from the last
 * fully finished sync, not mid-backlog. */
async function saveGmailCursor(db: Db, cursor: string) {
  const now = new Date()
  await db.insert(syncState)
    .values({
      source: "gmail",
      cursor,
      lastSyncedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: syncState.source,
      set: { cursor, updatedAt: now },
    })
}

async function syncFromHistory(
  db: Db,
  api: GmailApi,
  founderAddresses: Set<string>,
  startCursor: string,
  concurrency: number,
  cap: number,
  stats: GmailSyncStats,
  newest: NewestMessage
): Promise<{ more: boolean; cursor: string }> {
  let pageToken: string | undefined
  let lastCompleteRecordId = startCursor
  let mailboxHistoryId: string | null = null
  let more = false

  try {
    do {
      const page = await api.listHistory({
        startHistoryId: startCursor,
        pageToken,
      })
      if (page.historyId) mailboxHistoryId = page.historyId

      for (const record of page.records) {
        if (stats.fetched >= cap) {
          more = true
          break
        }
        const { complete } = await processMessageIds(
          db,
          api,
          founderAddresses,
          record.messageIds,
          concurrency,
          stats,
          cap,
          newest
        )
        if (!complete) {
          more = true
          break
        }
        lastCompleteRecordId = record.historyId
        await saveGmailCursor(db, lastCompleteRecordId)
      }

      if (more) break
      pageToken = page.nextPageToken
    } while (pageToken)

    if (!more) {
      const cursor = mailboxHistoryId ?? lastCompleteRecordId
      await saveGmailSuccess(db, cursor)
      return { more: false, cursor }
    }
    return { more: true, cursor: lastCompleteRecordId }
  } catch (error) {
    if (lastCompleteRecordId !== startCursor) {
      await saveGmailCursor(db, lastCompleteRecordId)
    }
    throw error
  }
}

async function processBackfillPage(
  db: Db,
  api: GmailApi,
  founderAddresses: Set<string>,
  initialWindow: string,
  concurrency: number,
  cap: number,
  stats: GmailSyncStats,
  newest: NewestMessage
): Promise<{ more: boolean; cursor: string | null }> {
  const { ids, newCursor, backfillPending, commit } = await collectFullSyncBatch(
    db,
    api,
    initialWindow
  )
  const { complete } = await processMessageIds(
    db,
    api,
    founderAddresses,
    ids,
    concurrency,
    stats,
    cap,
    newest
  )
  if (!complete) {
    stats.backfillPending = 1
    stats.moreRemaining = 1
    return { more: true, cursor: newCursor }
  }
  await commit()
  await saveGmailSuccess(db, newCursor)
  if (backfillPending) {
    stats.backfillPending = backfillPending
    stats.moreRemaining = 1
    return { more: true, cursor: newCursor }
  }
  return { more: false, cursor: newCursor }
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
  const concurrency = options.fetchConcurrency ?? DEFAULT_GMAIL_FETCH_CONCURRENCY
  const cap = options.maxMessagesPerRun ?? DEFAULT_GMAIL_MAX_MESSAGES_PER_RUN
  const newest: NewestMessage = { date: null }

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .limit(1)

  let more = false
  let cursorForLog: string | null = state?.cursor ?? null

  try {
    if (state?.cursor) {
      try {
        const result = await syncFromHistory(
          db,
          api,
          founderAddresses,
          state.cursor,
          concurrency,
          cap,
          stats,
          newest
        )
        more = result.more
        cursorForLog = result.cursor
      } catch (error) {
        if (!(error instanceof HistoryExpiredError)) throw error
        // Switch to a backfill exactly once: drop the expired cursor now so
        // later runs resume the backfill from its saved page instead of
        // hitting the expired cursor and restarting from page one.
        await db.update(syncState)
          .set({ cursor: null, updatedAt: new Date() })
          .where(eq(syncState.source, "gmail"))
        await clearGmailBackfillProgress(db)
        const result = await processBackfillPage(
          db,
          api,
          founderAddresses,
          initialWindow,
          concurrency,
          cap,
          stats,
          newest
        )
        more = result.more
        cursorForLog = result.cursor
      }
    } else {
      const result = await processBackfillPage(
        db,
        api,
        founderAddresses,
        initialWindow,
        concurrency,
        cap,
        stats,
        newest
      )
      more = result.more
      cursorForLog = result.cursor
    }
  } catch (error) {
    logGmailRun(stats, cursorForLog, more, newest.date)
    throw error
  }

  if (more) stats.moreRemaining = 1
  logGmailRun(stats, cursorForLog, more, newest.date)
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

  const concurrency = options.fetchConcurrency ?? DEFAULT_GMAIL_FETCH_CONCURRENCY
  const cap = options.maxMessagesPerRun ?? DEFAULT_GMAIL_MAX_MESSAGES_PER_RUN
  const newest: NewestMessage = { date: null }
  const query = gmailCatchUpListQuery(Number(after))
  let pageToken =
    (await getSetting(db, GMAIL_CATCHUP_PAGE_TOKEN_KEY)) ?? undefined
  const startedAt = Date.now()
  let more = false

  try {
    do {
      const page = await api.listMessageIds({ q: query, pageToken })
      const { complete } = await processMessageIds(
        db,
        api,
        founderAddresses,
        page.ids,
        concurrency,
        stats,
        cap,
        newest
      )
      if (!complete) {
        more = true
        break
      }
      pageToken = page.nextPageToken
      if (pageToken) await setSetting(db, GMAIL_CATCHUP_PAGE_TOKEN_KEY, pageToken)
      if (stats.fetched >= cap && pageToken) {
        more = true
        break
      }
    } while (pageToken && Date.now() - startedAt < budgetMs)

    if (more || pageToken) {
      stats.catchUpPending = 1
      stats.moreRemaining = 1
      logGmailRun(stats, historyId, true, newest.date)
      return stats
    }

    await saveGmailSuccess(db, historyId)
    await clearGmailCatchUpProgress(db)
    // The fresh cursor supersedes any half-finished backfill.
    await clearGmailBackfillProgress(db)
    logGmailRun(stats, historyId, false, newest.date)
    return stats
  } catch (error) {
    logGmailRun(stats, historyId, true, newest.date)
    throw error
  }
}
