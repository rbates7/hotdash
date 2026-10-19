import "server-only"

import { SENTRY_ORG, SENTRY_PROJECT, type SentryIssue } from "@/lib/inbox-sources"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * Sentry issues for org `chlk`, project `chlk-ios` — GET only, server
 * only. The token lives in `SENTRY_READONLY_TOKEN` and never leaves this
 * module: not logged, not returned, not importable from the client.
 *
 * Same shape as the workboard and Stripe services: a request never waits
 * for a sync; it gets the copy there is (5-minute cache, last good copy
 * kept so an outage reads as stale), and a due sync runs in the background.
 */

type Env = Record<string, string | undefined>

/** The org's region (`find_organizations`: chlk → us.sentry.io). */
const API = "https://us.sentry.io/api/0"

/** User (hex / `sntryu_`) and org (`sntrys_`, base64) tokens; no whitespace or quotes. */
const TOKEN_PATTERN = /^[A-Za-z0-9_+=/.-]{32,600}$/

export type SentryConfig = { kind: "missing" } | { kind: "invalid" } | { kind: "ok"; token: string }

export function readSentryConfig(env: Env = process.env): SentryConfig {
  const token = env.SENTRY_READONLY_TOKEN?.trim()
  if (!token) return { kind: "missing" }
  return TOKEN_PATTERN.test(token) ? { kind: "ok", token } : { kind: "invalid" }
}

export type SentryLoader = (token: string, signal?: AbortSignal) => Promise<SentryIssue[]>

/** At most this many issues: the Inbox shows the newest, not a full triage list. */
export const SENTRY_ISSUE_LIMIT = 100

class SentryHttpError extends Error {
  readonly type = "SentryHttpError"
}

export function createSentryLoader(fetchImpl: typeof fetch = (...args) => fetch(...args)): SentryLoader {
  return async (token, signal) => {
    const query = new URLSearchParams({
      query: "is:unresolved",
      statsPeriod: "14d",
      sort: "date",
      limit: String(SENTRY_ISSUE_LIMIT),
    })
    const res = await fetchImpl(`${API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?${query}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "hotdash-founder-dashboard" },
      cache: "no-store",
      signal,
    })
    if (!res.ok) throw new SentryHttpError(String(res.status))
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) throw Object.assign(new Error("invalid"), { type: "InvalidData" })
    return body.map((i: SentryIssue) => ({
      id: String(i.id),
      shortId: String(i.shortId),
      title: String(i.title),
      culprit: i.culprit ?? null,
      permalink: String(i.permalink),
      level: String(i.level),
      status: String(i.status),
      substatus: i.substatus ?? null,
      count: i.count,
      userCount: Number(i.userCount) || 0,
      firstSeen: String(i.firstSeen),
      lastSeen: String(i.lastSeen),
    }))
  }
}

export const loadFromSentry = createSentryLoader()

/** A word for the log, never an error's message or a response body. */
export function sentryFailureKind(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type
  if (typeof type === "string" && /^(SentryHttpError|InvalidData|SyncTimeout)$/.test(type)) return type
  return "UnknownError"
}

export const SENTRY_CACHE_TTL_MS = 5 * 60_000
export const SENTRY_RETRY_AFTER_MS = 60_000

export type SentryRead =
  | { status: "not_connected" | "connecting"; fetchedAt: null; issues: [] }
  | { status: "connected" | "stale"; fetchedAt: string; issues: SentryIssue[] }

export type SentryService = {
  read(): SentryRead
  settled(): Promise<void>
  reset(): void
}

export function createSentryService({
  env = () => process.env,
  load = loadFromSentry,
  clock = () => Date.now(),
  ttlMs = SENTRY_CACHE_TTL_MS,
  retryMs = SENTRY_RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[sentry] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: SentryLoader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): SentryService {
  let lastGood: { issues: SentryIssue[]; syncedAt: number } | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let generation = 0

  async function sync(token: string) {
    const at = clock()
    const mine = generation
    try {
      const issues = await withTimeout((signal) => load(token, signal), timeoutMs)
      if (mine !== generation) return
      lastGood = { issues, syncedAt: at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      lastAttempt = { at: clock(), ok: false }
      log(sentryFailureKind(error))
    }
  }

  return {
    read() {
      const config = readSentryConfig(env())
      if (config.kind !== "ok") return { status: "not_connected", fetchedAt: null, issues: [] }
      const age = lastAttempt ? clock() - lastAttempt.at : Infinity
      const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
      if (due && !inflight) {
        const run: Promise<void> = sync(config.token).finally(() => {
          if (inflight === run) inflight = null
        })
        inflight = run
      }
      if (!lastGood) {
        return { status: lastAttempt === null ? "connecting" : "not_connected", fetchedAt: null, issues: [] }
      }
      return {
        status: lastAttempt?.ok ? "connected" : "stale",
        fetchedAt: new Date(lastGood.syncedAt).toISOString(),
        issues: lastGood.issues,
      }
    },
    async settled() {
      await inflight
    },
    reset() {
      generation += 1
      lastGood = null
      lastAttempt = null
      inflight = null
    },
  }
}

export const sentryService = createSentryService()
