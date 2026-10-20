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
import { buildCrmList, emptyCrmList, parseFullThread } from "@/lib/crm/gmail-view"
import type { CrmFeedStatus, CrmListResponse, CrmThreadResponse } from "@/lib/crm/types"
import { GMAIL_CONCURRENCY, sharedGmailGate, type GmailGate } from "@/lib/server/gmail-limit"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * The support inbox (`GMAIL_MAILBOX`, info@chlkapp.com), read-only, server
 * only. The OAuth client ID, secret and refresh token live in server env
 * vars and never leave this module: they are not logged, not returned, and
 * nothing here is importable from a client component (`server-only`).
 *
 * Plain `fetch` against Google's REST endpoints — no SDK: a refresh-token
 * exchange at `oauth2.googleapis.com/token` (scope `gmail.readonly`, granted
 * once by `pnpm gmail:consent`) whose access token is reused until shortly
 * before it expires (`createTokenCache`), then `threads.list` and, per thread,
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
const GMAIL_ID = /^[0-9a-f]{1,32}$/i

export type Loader = (
  config: Extract<GmailConfig, { kind: "ok" }>,
  /** Aborted when the sync runs out of time. */
  signal?: AbortSignal
) => Promise<GmailThreadMeta[]>

export type GmailErrorType = "GmailAuth" | "GmailApi" | "GmailRateLimited" | "InvalidData"

/**
 * Google's non-secret error fields, for the log. Only codes from fixed
 * places in Google's error JSON (the OAuth `error`, the Gmail API
 * `error.status` and `error.errors[].reason`) and only when they look like
 * a code (letters and underscores, ≤ 48) — never `error_description`,
 * `message`, a body, a header or anything we sent.
 */
export type GoogleErrorDetail = {
  /** Which call failed: the token exchange or a Gmail API read. */
  step: "token" | "api"
  status: number
  /** OAuth `error`, e.g. invalid_grant, unauthorized_client. */
  error?: string
  /** Gmail API `error.status`, e.g. PERMISSION_DENIED, RESOURCE_EXHAUSTED. */
  apiStatus?: string
  /** Gmail API `error.errors[].reason`, e.g. userRateLimitExceeded. */
  reasons?: string[]
}

/** A failure with a fixed word for the log; never a message from Google. */
class GmailError extends Error {
  constructor(
    readonly type: GmailErrorType,
    readonly detail?: GoogleErrorDetail
  ) {
    super(type)
    this.name = "GmailError"
  }
}

const asString = (v: unknown) => (typeof v === "string" ? v : null)

/** What an error code looks like; a token, secret or sentence never does. */
const SAFE_CODE = /^[A-Za-z][A-Za-z_]{0,47}$/

/** Gmail's 403 reasons (and status) that mean slow down, not "not allowed". */
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded"])

/**
 * Google's error fields from a failed response, code-shaped values only.
 * `secrets` are dropped even if Google echoed one in a code field.
 */
export function googleErrorDetail(
  step: GoogleErrorDetail["step"],
  status: number,
  body: unknown,
  secrets: readonly string[] = []
): GoogleErrorDetail {
  const safe = (v: unknown) => {
    const s = asString(v)
    return s && SAFE_CODE.test(s) && !secrets.some((secret) => secret && s.includes(secret)) ? s : undefined
  }
  const detail: GoogleErrorDetail = { step, status: Number.isInteger(status) ? status : 0 }
  const err = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined
  if (typeof err === "string") {
    const code = safe(err)
    if (code) detail.error = code
  } else if (err && typeof err === "object") {
    const e = err as { status?: unknown; errors?: unknown }
    const apiStatus = safe(e.status)
    if (apiStatus) detail.apiStatus = apiStatus
    const reasons = (Array.isArray(e.errors) ? e.errors : [])
      .map((x) => safe((x as { reason?: unknown } | null)?.reason))
      .filter((r): r is string => Boolean(r))
      .slice(0, 5)
    if (reasons.length) detail.reasons = [...new Set(reasons)]
  }
  return detail
}

/** 401 and other 403s are an invalid token or grant; 429 or a quota 403 is a rate limit. */
export function classifyGoogleError(detail: GoogleErrorDetail): Exclude<GmailErrorType, "InvalidData"> {
  const rate =
    detail.status === 429 ||
    detail.apiStatus === "RESOURCE_EXHAUSTED" ||
    (detail.status === 403 && (detail.reasons ?? []).some((r) => RATE_REASONS.has(r)))
  if (rate) return "GmailRateLimited"
  if (detail.step === "token") return detail.status >= 500 ? "GmailApi" : "GmailAuth"
  return detail.status === 401 || detail.status === 403 ? "GmailAuth" : "GmailApi"
}

async function googleError(step: GoogleErrorDetail["step"], res: Response, secrets: readonly string[]) {
  const body = await res.json().catch(() => null)
  const detail = googleErrorDetail(step, res.status, body, secrets)
  return new GmailError(classifyGoogleError(detail), detail)
}

/* ------------------------------------------------------------ token cache */

/** Refresh this long before Google's `expires_in` runs out. */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000

type OkConfig = Extract<GmailConfig, { kind: "ok" }>

export type TokenCache = {
  /** A valid access token: the cached one, or one refresh shared by every caller waiting now. */
  get(config: OkConfig, signal?: AbortSignal): Promise<string>
  /** Forget the token (Gmail said 401), so the next `get` refreshes. */
  invalidate(): void
}

/**
 * The access token for this server instance, shared by every request:
 * reused until `TOKEN_EXPIRY_MARGIN_MS` before `expires_in`, and at most one
 * refresh in flight (callers that arrive meanwhile wait for it). A token is
 * only reused for the same client and refresh token. Other instances keep
 * their own (sharing one needs a store; see docs/gmail-setup.md).
 */
export function createTokenCache(fetchImpl: typeof fetch = fetch, clock: () => number = () => Date.now()): TokenCache {
  let cached: { token: string; expiresAt: number; key: string } | null = null
  let inflight: { promise: Promise<string>; key: string } | null = null

  const keyOf = (config: OkConfig) => `${config.clientId}\u0000${config.refreshToken}`

  async function refresh(config: OkConfig, key: string, signal?: AbortSignal) {
    const secrets = [config.clientSecret, config.refreshToken, config.clientId]
    const res = await fetchImpl(TOKEN_URL, {
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
    if (!res.ok) throw await googleError("token", res, secrets)
    const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
    const token = asString(body?.access_token)
    if (!token) throw new GmailError("GmailAuth", { step: "token", status: res.status, error: "no_access_token" })
    const expiresIn = typeof body?.expires_in === "number" && Number.isFinite(body.expires_in) ? body.expires_in : 0
    const expiresAt = clock() + expiresIn * 1000 - TOKEN_EXPIRY_MARGIN_MS
    // No (or a too-short) expiry: use it for this sync only, never reuse it.
    cached = expiresAt > clock() ? { token, expiresAt, key } : null
    return token
  }

  return {
    get(config, signal) {
      const key = keyOf(config)
      if (cached && cached.key === key && clock() < cached.expiresAt) return Promise.resolve(cached.token)
      if (inflight && inflight.key === key) return inflight.promise
      const promise = refresh(config, key, signal).finally(() => {
        if (inflight?.promise === promise) inflight = null
      })
      inflight = { promise, key }
      return promise
    },
    invalidate() {
      cached = null
    },
  }
}

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
 * logs, and an error carries only Google's code-shaped fields
 * (`GoogleErrorDetail`), never its text.
 */
export function gmailLoader(
  fetchImpl: typeof fetch = fetch,
  tokens: TokenCache = createTokenCache(fetchImpl),
  gate: GmailGate = sharedGmailGate
): Loader {
  return async (config, signal) => {
    const accessToken = await tokens.get(config, signal)
    const secrets = [config.clientSecret, config.refreshToken, config.clientId, accessToken]

    const base = `${GMAIL_API}/${encodeURIComponent(config.mailbox)}`
    const get = (url: string) =>
      gate(async () => {
        const res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          signal,
          cache: "no-store",
        })
        if (!res.ok) {
          // A revoked or expired access token: refresh on the next sync.
          if (res.status === 401) tokens.invalidate()
          throw await googleError("api", res, secrets)
        }
        return (await res.json()) as unknown
      }, signal)

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
    const threads = await mapLimited(ids, GMAIL_CONCURRENCY, async (id) => slimThread(await get(`${base}/threads/${id}?${params}`)))
    return threads.filter((t): t is GmailThreadMeta => t !== null)
  }
}

/** Reads one whole thread (`format=full`): bodies and attachment metadata, never attachment bytes. */
export type ThreadLoader = (config: OkConfig, gmailThreadId: string, signal?: AbortSignal) => Promise<unknown>

export function gmailThreadLoader(
  fetchImpl: typeof fetch = fetch,
  tokens: TokenCache = createTokenCache(fetchImpl),
  gate: GmailGate = sharedGmailGate
): ThreadLoader {
  return async (config, gmailThreadId, signal) => {
    if (!GMAIL_ID.test(gmailThreadId)) throw new GmailError("InvalidData")
    const accessToken = await tokens.get(config, signal)
    const secrets = [config.clientSecret, config.refreshToken, config.clientId, accessToken]
    const url = `${GMAIL_API}/${encodeURIComponent(config.mailbox)}/threads/${gmailThreadId}?format=full`
    return gate(async () => {
      const res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal,
        cache: "no-store",
      })
      if (!res.ok) {
        if (res.status === 401) tokens.invalidate()
        throw await googleError("api", res, secrets)
      }
      return (await res.json()) as unknown
    }, signal)
  }
}

/** One thread's bodies are fetched on demand, cut off after this. */
export const THREAD_TIMEOUT_MS = 8_000

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

/** What each kind means in the log, in words that tell them apart. */
const KIND_WORDS: Record<string, string> = {
  GmailAuth: "invalid token or grant",
  GmailRateLimited: "rate limited",
  GmailApi: "Gmail API error",
}

/**
 * Google's code fields for the log, e.g. `invalid token or grant: token
 * status=400 error=invalid_grant` or `rate limited: api status=403
 * reason=userRateLimitExceeded`. Re-checked here, so only code-shaped
 * values from a `GmailError` ever reach the log. `null` when there is none.
 */
export function failureDetail(error: unknown): string | null {
  if (!(error instanceof GmailError) || !error.detail) return null
  const d = error.detail
  const code = (v: unknown) => (typeof v === "string" && SAFE_CODE.test(v) ? v : null)
  const parts = [d.step === "token" ? "token" : "api", `status=${Number.isInteger(d.status) ? d.status : 0}`]
  if (code(d.error)) parts.push(`error=${d.error}`)
  if (code(d.apiStatus)) parts.push(`apiStatus=${d.apiStatus}`)
  for (const r of d.reasons ?? []) if (code(r)) parts.push(`reason=${r}`)
  return `${KIND_WORDS[error.type] ?? error.type}: ${parts.join(" ")}`
}

/* ------------------------------------------------------------------ cache */

/** How long a good sync is served before the next request re-reads Gmail. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying Gmail again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { data: CrmLiveData; syncedAt: number; threads: GmailThreadMeta[]; gmailIds: Map<string, string> }

export type GmailService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  summary(): Promise<GmailSummary>
  health(): Promise<GmailHealth>
  /** The CRM screen's list (`src/lib/crm/types.ts`). */
  list(): Promise<CrmListResponse & GmailSummary>
  /** One case's messages, or null when the case is unknown. */
  thread(caseId: string): Promise<CrmThreadResponse | null>
  /** Settles when the background sync running now (if any) is done (for `after()`). */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createGmailService({
  env = () => process.env,
  load = gmailLoader(),
  loadThread = gmailThreadLoader(),
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string, detail?: string) => console.warn(`[gmail] sync failed: ${kind}${detail ? ` (${detail})` : ""}`),
}: {
  env?: () => Env
  load?: Loader
  loadThread?: ThreadLoader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string, detail?: string) => void
} = {}): GmailService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  const threadCache = new Map<string, { at: number; messages: CrmThreadResponse["messages"] }>()
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
      const gmailIds = new Map(
        threads.flatMap((t) => {
          const n = ids.peek("thread", t.id)
          return n === undefined ? [] : [[`case-${n}`, t.id] as const]
        })
      )
      lastGood = { data, syncedAt: at, threads: [...threads], gmailIds }
      threadCache.clear()
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      // Retry a minute after it failed, not after it started.
      lastAttempt = { at: clock(), ok: false }
      const detail = failureDetail(error)
      if (detail) log(failureKind(error), detail)
      else log(failureKind(error))
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

  const service: GmailService = {
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
    async list() {
      const summary = await service.summary()
      const base = { ...summary, lastUpdated: summary.lastSyncedAt }
      const snapshot = lastGood
      if (summary.data === null || !snapshot) return { ...base, ...emptyCrmList() }
      return {
        ...base,
        ...buildCrmList(snapshot.threads, { mailbox: summary.mailbox, ids, nowMs: clock(), data: snapshot.data }),
      }
    },
    async thread(caseId) {
      const summary = await service.summary()
      const status: CrmFeedStatus = summary.status
      const lastUpdated = summary.lastSyncedAt
      const snapshot = lastGood
      if (summary.data === null || !snapshot) return { status, lastUpdated, caseId, messages: [] }
      const gmailId = snapshot.gmailIds.get(caseId)
      if (!gmailId || !snapshot.data.cases.some((c) => c.id === caseId)) return null
      const threadId = `thread-${caseId.slice("case-".length)}`
      const hit = threadCache.get(caseId)
      if (hit && clock() - hit.at < ttlMs) return { status, lastUpdated, caseId, messages: hit.messages }
      const config = readGmailConfig(env())
      try {
        if (config.kind !== "ok") throw new GmailError("GmailAuth")
        const raw = await withTimeout((signal) => loadThread(config, gmailId, signal), THREAD_TIMEOUT_MS)
        const messages = parseFullThread(raw, { mailbox: summary.mailbox, threadId })
        threadCache.set(caseId, { at: clock(), messages })
        return { status, lastUpdated, caseId, messages }
      } catch (error) {
        const detail = failureDetail(error)
        log(failureKind(error), detail ?? undefined)
        // The last good bodies if there are any; else the snippets from the list sync.
        if (hit) return { status: "stale", lastUpdated, caseId, messages: hit.messages }
        const messages = snapshot.data.messages
          .filter((m) => m.caseId === caseId)
          .map((m, i) => ({
            id: `${threadId}-m${i + 1}`,
            threadId,
            direction: m.direction,
            from: { name: m.fromName, email: m.fromEmail },
            to: m.toEmails.map((email) => ({ name: null, email })),
            cc: [],
            sentAt: m.sentAt,
            bodyText: m.bodyText,
            attachments: [],
          }))
        return { status: "stale", lastUpdated, caseId, messages }
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
      threadCache.clear()
      ids = createIdRegistry()
    },
  }
  return service
}

/** The one cache for this server process, shared by every route. */
const sharedTokens = createTokenCache()
export const gmailService = createGmailService({ load: gmailLoader(fetch, sharedTokens), loadThread: gmailThreadLoader(fetch, sharedTokens) })
