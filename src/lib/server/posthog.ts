import "server-only"

import { computePosthogMetrics, LOOKBACK_DAYS, WINDOW_DAYS, type PosthogData, type PosthogMetrics } from "@/lib/posthog-metrics"
import { POSTHOG_NOT_CONNECTED, type PosthogHealth, type PosthogSummary } from "@/lib/posthog-summary"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * Live PostHog, read-only, server only. The personal API key and project
 * id live in server env vars and never leave this module: not logged, not
 * returned, and nothing here is importable from a client component
 * (`server-only`).
 *
 * Only PostHog's query endpoint is called (`POST /api/projects/:id/query/`
 * with a `HogQLQuery`): HogQL is SELECT-only, so even a key with wider
 * scopes could not change anything through it. The queries are fixed
 * strings — nothing from a request goes into them — and return counts
 * only: no person ids, emails or properties are read.
 *
 * Same cache as Stripe (`./stripe.ts`): one sync per `CACHE_TTL_MS`, always
 * in the background — a request never waits for it, and gets
 * `not_connected` until the first sync lands — with the last good copy
 * kept as stale through an outage, a 1-minute retry, and a hard cut-off at
 * `SYNC_TIMEOUT_MS`.
 */

/* ----------------------------------------------------------------- config */

type Env = Record<string, string | undefined>

/** US Cloud, used when `POSTHOG_HOST` is unset or blank (prod sets only the key). */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

export type PosthogConfig =
  | { kind: "missing" }
  /** Set, but not something this module will send anywhere. */
  | { kind: "invalid" }
  | { kind: "ok"; key: string; projectId: string; host: string }

/** PostHog personal API keys start `phx_`. Project API keys (`phc_`) cannot query. */
const KEY_PATTERN = /^phx_[A-Za-z0-9_-]+$/
const PROJECT_PATTERN = /^[1-9][0-9]{0,11}$/
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

/**
 * The host as an origin, or null when the key must not go there: PostHog
 * Cloud over https (`us.posthog.com`, `eu.posthog.com`, …) only, with no
 * path, credentials or port. A loopback mock (http or https) is allowed
 * only when `allowLoopback`.
 */
function hostOrigin(raw: string, allowLoopback: boolean): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null
  if (LOOPBACK.has(url.hostname)) {
    return allowLoopback && (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null
  }
  const posthog = url.hostname === "posthog.com" || url.hostname.endsWith(".posthog.com")
  return url.protocol === "https:" && posthog && !url.port ? url.origin : null
}

/**
 * Chlk's PostHog project ("CHLK iOS"). Not a secret — it is in every
 * PostHog URL — so it is pinned here and only the key is an env var.
 */
export const CHLK_POSTHOG_PROJECT_ID = "472613"

/**
 * Read the key and host from the environment. Only `POSTHOG_READONLY_KEY`
 * is needed (the project is `CHLK_POSTHOG_PROJECT_ID`); unset it is
 * `missing`, malformed (not `phx_…`) `invalid`.
 * `POSTHOG_HOST` is optional (US Cloud by default); a loopback host is for
 * local runs and tests only — refused in a production build unless
 * `POSTHOG_ALLOW_MOCK_HOST=1` — and any host that breaks the rules makes
 * the whole config invalid, so the key is never sent to the wrong place.
 */
export function readPosthogConfig(env: Env = process.env): PosthogConfig {
  const key = env.POSTHOG_READONLY_KEY?.trim()
  const projectId = CHLK_POSTHOG_PROJECT_ID
  if (!key) return { kind: "missing" }
  if (!KEY_PATTERN.test(key) || !PROJECT_PATTERN.test(projectId)) return { kind: "invalid" }
  const rawHost = env.POSTHOG_HOST?.trim()
  if (!rawHost) return { kind: "ok", key, projectId, host: DEFAULT_POSTHOG_HOST }
  const allowLoopback = env.NODE_ENV !== "production" || env.POSTHOG_ALLOW_MOCK_HOST === "1"
  const host = hostOrigin(rawHost, allowLoopback)
  return host ? { kind: "ok", key, projectId, host } : { kind: "invalid" }
}

/* ----------------------------------------------------------------- queries */

/** One rolling 28-day window, in seconds (the queries bucket by elapsed time). */
const WINDOW_SEC = WINDOW_DAYS * 86_400

/**
 * Per 28-day window (0 = the latest, back to 6): how many people had any
 * event in it, and how many of them also had one in the next, newer window.
 * Each person's windows are collected once, then counted per window.
 */
export const WINDOWS_HOGQL = `SELECT w, count() AS active, countIf(has(ws, w - 1)) AS retained
FROM (
  SELECT person_id, groupUniqArray(intDiv(dateDiff('second', timestamp, now()), ${WINDOW_SEC})) AS ws
  FROM events
  WHERE timestamp > now() - INTERVAL ${LOOKBACK_DAYS} DAY AND timestamp <= now()
  GROUP BY person_id
)
ARRAY JOIN ws AS w
GROUP BY w
ORDER BY w`

/** People with any event in the last 24 h and in the last 7 days. */
export const RECENT_HOGQL = `SELECT countIf(last_seen > now() - INTERVAL 1 DAY) AS day, count() AS week
FROM (
  SELECT person_id, max(timestamp) AS last_seen
  FROM events
  WHERE timestamp > now() - INTERVAL 7 DAY AND timestamp <= now()
  GROUP BY person_id
)`

/** PostHog's clock, and its first event in the lookback (to tell "none yet" from "before PostHog"). */
export const SPAN_HOGQL = `SELECT toUnixTimestamp(now()) AS now, count() AS events, toUnixTimestamp(min(timestamp)) AS earliest
FROM events
WHERE timestamp > now() - INTERVAL ${LOOKBACK_DAYS} DAY AND timestamp <= now()`

/** Per call, under the sync's own limit. */
const REQUEST_TIMEOUT_MS = 60_000

export type Loader = (
  config: Extract<PosthogConfig, { kind: "ok" }>,
  /** Aborted when the sync runs out of time. */
  signal?: AbortSignal
) => Promise<PosthogData>

export class PosthogHttpError extends Error {
  readonly type: string
  constructor(status: number) {
    super("posthog http error")
    // The status class only — a body could echo the request.
    this.type =
      status === 401 || status === 403 ? "PosthogAuthError" : status === 429 ? "PosthogRateLimited" : status >= 500 ? "PosthogServerError" : "PosthogRequestError"
  }
}

class InvalidDataError extends Error {
  readonly type = "InvalidData"
}

type Fetch = typeof fetch

/** Rows as objects keyed by column, from a query response; throws if it is not one. */
function rowsOf(body: unknown): Record<string, unknown>[] {
  const b = body as { results?: unknown; columns?: unknown } | null
  if (!b || !Array.isArray(b.results) || !Array.isArray(b.columns) || !b.columns.every((c) => typeof c === "string")) {
    throw new InvalidDataError()
  }
  const columns = b.columns as string[]
  return b.results.map((row) => {
    if (!Array.isArray(row) || row.length !== columns.length) throw new InvalidDataError()
    return Object.fromEntries(columns.map((c, i) => [c, row[i]]))
  })
}

const int = (v: unknown) => {
  // ClickHouse's UInt64 may come back as a string.
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new InvalidDataError()
  return n
}

/**
 * The default loader: the three fixed HogQL queries above, POSTed to the
 * project's query endpoint with the key as a Bearer token.
 */
export function posthogLoader(fetchImpl: Fetch = fetch): Loader {
  return async (config, signal) => {
    const query = async (hogql: string, name: string) => {
      const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]
      const res = await fetchImpl(`${config.host}/api/projects/${config.projectId}/query/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql }, name: `hotdash-${name}` }),
        signal: AbortSignal.any(signals),
        cache: "no-store",
        redirect: "error",
      })
      if (!res.ok) throw new PosthogHttpError(res.status)
      return rowsOf(await res.json())
    }
    // One after another: three light reads, not a burst against the rate limit.
    const span = await query(SPAN_HOGQL, "span")
    const windows = await query(WINDOWS_HOGQL, "windows")
    const recent = await query(RECENT_HOGQL, "recent")
    if (span.length !== 1 || recent.length !== 1) throw new InvalidDataError()
    const events = int(span[0].events)
    return {
      now: int(span[0].now),
      earliest: events === 0 ? null : int(span[0].earliest),
      windows: windows.map((r) => ({ w: int(r.w), active: int(r.active), retained: int(r.retained) })),
      recent: { day: int(recent[0].day), week: int(recent[0].week) },
    }
  }
}

/**
 * A word for the log, never the error's message (a network error can quote
 * the URL, a response the request): our own error types, the platform's
 * abort and network errors, or `UnknownError`.
 */
export function failureKind(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type
  if (typeof type === "string" && /^(Posthog\w+|InvalidData|SyncTimeout)$/.test(type)) return type
  const name = (error as { name?: unknown } | null)?.name
  if (name === "TimeoutError" || name === "AbortError") return name
  if (error instanceof TypeError) return "NetworkError"
  return "UnknownError"
}

/* ----------------------------------------------------------------- cache */

/** How long a good sync is served before the next request re-reads PostHog. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying PostHog again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { metrics: PosthogMetrics; syncedAt: number }

export type PosthogService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  summary(): Promise<PosthogSummary>
  health(): Promise<PosthogHealth>
  /** Settles when the background sync running now (if any) is done (for `after()`). */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createPosthogService({
  env = () => process.env,
  load = posthogLoader(),
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[posthog] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): PosthogService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  /** Bumped by `reset()`, so a sync started before it cannot write after it. */
  let generation = 0

  async function sync(config: Extract<PosthogConfig, { kind: "ok" }>) {
    const at = clock()
    const mine = generation
    try {
      const data = await withTimeout((signal) => load(config, signal), timeoutMs)
      if (mine !== generation) return
      let metrics: PosthogMetrics
      try {
        metrics = computePosthogMetrics(data)
      } catch {
        throw new InvalidDataError()
      }
      lastGood = { metrics, syncedAt: at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      // Retry a minute after it failed, not after it started.
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  /** Whether the copy is current, starting a due sync in the background. Never waits; never throws. */
  function read(): { fresh: boolean; configured: boolean } {
    const config = readPosthogConfig(env())
    if (config.kind !== "ok") return { fresh: false, configured: false }
    const age = lastAttempt ? clock() - lastAttempt.at : Infinity
    const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
    if (due && !inflight) {
      const run: Promise<void> = sync(config).finally(() => {
        if (inflight === run) inflight = null
      })
      inflight = run
    }
    return { fresh: Boolean(lastAttempt?.ok && lastGood), configured: true }
  }

  return {
    async summary() {
      const { fresh } = read()
      const snapshot = lastGood
      if (!snapshot) return POSTHOG_NOT_CONNECTED
      return {
        status: fresh ? "connected" : "stale",
        lastSyncedAt: new Date(snapshot.syncedAt).toISOString(),
        metrics: snapshot.metrics,
      }
    },
    async health() {
      const { fresh, configured } = read()
      if (!configured) return "not_configured"
      return fresh ? "ok" : "unavailable"
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

/** The one cache for this server process, shared by every route. */
export const posthogService = createPosthogService()
