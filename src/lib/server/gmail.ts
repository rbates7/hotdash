import "server-only"

import {
  createIdRegistry,
  mapGmailThreads,
  type GmailMessageMeta,
  type GmailThreadMeta,
  type IdRegistry,
} from "@/lib/crm/gmail-mapping"
import {
  DEFAULT_MAILBOX,
  gmailConnecting,
  gmailNotConnected,
  isCrmLiveData,
  type CrmLiveData,
  type GmailHealth,
  type GmailSummary,
} from "@/lib/crm/gmail-summary"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * The support inbox (`GMAIL_MAILBOX`, info@chlkapp.com), read-only, server
 * only. The OAuth client ID, secret and refresh token live in server env
 * vars and never leave this module: they are not logged, not returned, and
 * nothing here is importable from a client component (`server-only`).
 *
 * Plain `fetch` against Google's REST endpoints — no SDK: one refresh-token
 * exchange at `oauth2.googleapis.com/token` (scope `gmail.readonly`, granted
 * once by `pnpm gmail:consent`), then `threads.list` and, per thread,
 * `threads.get?format=metadata` (headers, labels and Gmail's snippet —
 * never a body or an attachment). The threads are mapped into the CRM's
 * own rows (`mapGmailThreads`) and kept for `CACHE_TTL_MS`; the last good
 * copy is kept indefinitely, so a Gmail outage shows the last threads as
 * stale instead of nothing.
 *
 * A request never waits for a sync: it gets the copy there is now — or
 * `not_connected` before the first sync lands — and a due sync starts in
 * the background, one at a time, cut off after `SYNC_TIMEOUT_MS` (the
 * abort signal reaches every fetch).
 */

/* ----------------------------------------------------------------- config */

type Env = Record<string, string | undefined>

export type GmailConfig =
  | { kind: "missing"; mailbox: string }
  /** Set, but not something this module will send anywhere. */
  | { kind: "invalid"; mailbox: string }
  | { kind: "ok"; clientId: string; clientSecret: string; refreshToken: string; mailbox: string }

/** Google's OAuth client IDs; nothing else is sent. */
const CLIENT_ID = /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/
/** Secrets and tokens are one printable run, no whitespace. */
const TOKENISH = /^[\x21-\x7e]{8,512}$/
const MAILBOX = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/

/**
 * Read the OAuth client and refresh token from the environment. None of
 * the three set is `missing`; some, or any that is malformed, is
 * `invalid` (nothing is sent). `GMAIL_MAILBOX` is the inbox to read and
 * must be the account that granted the token (Gmail refuses any other);
 * it defaults to info@chlkapp.com. It is not a secret, so the CRM shows it.
 */
export function readGmailConfig(env: Env = process.env): GmailConfig {
  const rawMailbox = env.GMAIL_MAILBOX?.trim().toLowerCase()
  const mailboxOk = !rawMailbox || MAILBOX.test(rawMailbox)
  const mailbox = rawMailbox && mailboxOk ? rawMailbox : DEFAULT_MAILBOX
  const clientId = env.GMAIL_CLIENT_ID?.trim()
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim()
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim()
  if (!clientId && !clientSecret && !refreshToken) return { kind: "missing", mailbox }
  if (!clientId || !clientSecret || !refreshToken || !mailboxOk) return { kind: "invalid", mailbox }
  if (!CLIENT_ID.test(clientId) || !TOKENISH.test(clientSecret) || !TOKENISH.test(refreshToken)) {
    return { kind: "invalid", mailbox }
  }
  return { kind: "ok", clientId, clientSecret, refreshToken, mailbox }
}

/* ------------------------------------------------------------------ fetch */

export const TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users"
/** The most recent threads read per sync. */
export const MAX_THREADS = 100
/**
 * What a sync lists: the last 90 days, without Gmail's promotions and
 * social tabs (a no-op when the inbox has no tabs). Spam and trash are
 * never listed (`includeSpamTrash` is off by default).
 */
export const THREAD_QUERY = "newer_than:90d -category:promotions -category:social"
/** `threads.get` calls in flight at once, well under Gmail's per-user rate. */
const CONCURRENCY = 5
const GMAIL_ID = /^[0-9a-f]{1,32}$/i

export type Loader = (
  config: Extract<GmailConfig, { kind: "ok" }>,
  /** Aborted when the sync runs out of time. */
  signal?: AbortSignal
) => Promise<GmailThreadMeta[]>

/** A failure with a fixed word for the log; never a message from Google. */
class GmailError extends Error {
  constructor(readonly type: "GmailAuth" | "GmailApi" | "GmailRateLimited" | "InvalidData") {
    super(type)
    this.name = "GmailError"
  }
}

function apiError(status: number) {
  return new GmailError(status === 401 || status === 403 ? "GmailAuth" : status === 429 ? "GmailRateLimited" : "GmailApi")
}

const asString = (v: unknown) => (typeof v === "string" ? v : null)

/** Only the fields the mapper reads; everything else Google sent is dropped. */
export function slimThread(raw: unknown): GmailThreadMeta | null {
  if (!raw || typeof raw !== "object") return null
  const t = raw as { id?: unknown; messages?: unknown }
  const id = asString(t.id)
  if (!id || !GMAIL_ID.test(id) || !Array.isArray(t.messages)) return null
  const messages: GmailMessageMeta[] = []
  for (const m of t.messages as Array<Record<string, unknown>>) {
    const mid = asString(m?.id)
    const internalDate = asString(m?.internalDate)
    if (!mid || !internalDate || !/^\d{1,16}$/.test(internalDate)) continue
    const headers = Array.isArray((m.payload as { headers?: unknown } | undefined)?.headers)
      ? ((m.payload as { headers: Array<{ name?: unknown; value?: unknown }> }).headers)
      : []
    const header = (name: string) =>
      asString(headers.find((h) => typeof h?.name === "string" && h.name.toLowerCase() === name)?.value)
    messages.push({
      id: mid,
      labelIds: Array.isArray(m.labelIds) ? m.labelIds.filter((l): l is string => typeof l === "string") : [],
      internalDate,
      snippet: asString(m.snippet) ?? "",
      headers: { from: header("from"), to: header("to"), subject: header("subject") },
    })
  }
  return { id, messages }
}

/** `items`, `limit` at a time, in order. Stops at the first failure. */
async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length)
  let next = 0
  let failed = false
  const worker = async () => {
    while (next < items.length && !failed) {
      const i = next++
      try {
        out[i] = await fn(items[i]!)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * The read-only calls. `fetchImpl` is swappable for tests; nothing in here
 * logs, and no error carries Google's response text.
 */
export function gmailLoader(fetchImpl: typeof fetch = fetch): Loader {
  return async (config, signal) => {
    const tokenRes = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
      signal,
      cache: "no-store",
    })
    if (!tokenRes.ok) throw new GmailError("GmailAuth")
    const accessToken = asString(((await tokenRes.json()) as { access_token?: unknown } | null)?.access_token)
    if (!accessToken) throw new GmailError("GmailAuth")

    const base = `${GMAIL_API}/${encodeURIComponent(config.mailbox)}`
    const get = async (url: string) => {
      const res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal,
        cache: "no-store",
      })
      if (!res.ok) throw apiError(res.status)
      return (await res.json()) as unknown
    }

    const list = (await get(
      `${base}/threads?${new URLSearchParams({ maxResults: String(MAX_THREADS), q: THREAD_QUERY })}`
    )) as { threads?: unknown } | null
    const ids = (Array.isArray(list?.threads) ? list.threads : [])
      .map((t) => asString((t as { id?: unknown } | null)?.id))
      .filter((id): id is string => id !== null && GMAIL_ID.test(id))
      .slice(0, MAX_THREADS)

    const params = new URLSearchParams({
      format: "metadata",
      fields: "id,messages(id,labelIds,snippet,internalDate,payload/headers)",
    })
    for (const h of ["From", "To", "Subject"]) params.append("metadataHeaders", h)
    const threads = await mapLimited(ids, CONCURRENCY, async (id) => slimThread(await get(`${base}/threads/${id}?${params}`)))
    return threads.filter((t): t is GmailThreadMeta => t !== null)
  }
}

/**
 * A word for the log, never the error's message: a failed token exchange
 * can echo the request, and Google's error text is not ours to print.
 */
export function failureKind(error: unknown) {
  const type = (error as { type?: unknown; name?: unknown } | null)?.type
  if (typeof type === "string" && /^(Gmail\w+|InvalidData|SyncTimeout)$/.test(type)) return type
  if ((error as { name?: unknown } | null)?.name === "AbortError") return "Aborted"
  return "UnknownError"
}

/* ------------------------------------------------------------------ cache */

/** How long a good sync is served before the next request re-reads Gmail. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying Gmail again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { data: CrmLiveData; syncedAt: number }

export type GmailService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  summary(): Promise<GmailSummary>
  health(): Promise<GmailHealth>
  /** Settles when the background sync running now (if any) is done (for `after()`). */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createGmailService({
  env = () => process.env,
  load = gmailLoader(),
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[gmail] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): GmailService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let ids: IdRegistry = createIdRegistry()
  /** Bumped by `reset()`, so a sync started before it cannot write after it. */
  let generation = 0

  async function sync(config: Extract<GmailConfig, { kind: "ok" }>) {
    const at = clock()
    const mine = generation
    try {
      const threads = await withTimeout((signal) => load(config, signal), timeoutMs)
      if (mine !== generation) return
      // Prove the copy is whole before it replaces a good one.
      let data: CrmLiveData
      try {
        data = mapGmailThreads(threads, { mailbox: config.mailbox, ids })
      } catch {
        throw new GmailError("InvalidData")
      }
      if (!isCrmLiveData(data)) throw new GmailError("InvalidData")
      lastGood = { data, syncedAt: at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      // Retry a minute after it failed, not after it started.
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  /**
   * Whether the copy is current, starting a sync in the background when
   * one is due and none is running. Never waits for it; never throws.
   */
  function read(): { fresh: boolean; configured: boolean; connecting: boolean; mailbox: string } {
    const config = readGmailConfig(env())
    if (config.kind !== "ok") return { fresh: false, configured: false, connecting: false, mailbox: config.mailbox }
    const age = lastAttempt ? clock() - lastAttempt.at : Infinity
    const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
    if (due && !inflight) {
      const run: Promise<void> = sync(config).finally(() => {
        if (inflight === run) inflight = null
      })
      inflight = run
    }
    // No sync has finished yet: the first one (started above) is running.
    // The rule `@/lib/server/stripe` uses; a failed first sync ends it.
    return {
      fresh: Boolean(lastAttempt?.ok && lastGood),
      configured: true,
      connecting: !lastAttempt && !lastGood,
      mailbox: config.mailbox,
    }
  }

  return {
    async summary() {
      const { fresh, connecting, mailbox } = read()
      const snapshot = lastGood
      if (!snapshot) return connecting ? gmailConnecting(mailbox) : gmailNotConnected(mailbox)
      return {
        status: fresh ? "connected" : "stale",
        lastSyncedAt: new Date(snapshot.syncedAt).toISOString(),
        mailbox,
        data: snapshot.data,
      }
    },
    async health() {
      const { fresh, configured, connecting } = read()
      if (!configured) return "not_configured"
      if (connecting) return "connecting"
      return fresh ? "ok" : "error"
    },
    async settled() {
      await inflight
    },
    reset() {
      generation += 1
      lastGood = null
      lastAttempt = null
      inflight = null
      ids = createIdRegistry()
    },
  }
}

/** The one cache for this server process, shared by every route. */
export const gmailService = createGmailService()
