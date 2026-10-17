import "server-only"

import {
  NOTION_NOT_CONNECTED,
  type LiveRoadmap,
  type NotionHealth,
  type NotionRoadmapSummary,
} from "@/lib/notion-roadmap"
import { mapNotionRows } from "@/lib/roadmap/notion-map"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * The Roadmap from Notion, read-only, server only. The token lives in one
 * server env var and never leaves this module: it is not logged, not
 * returned, and nothing here is importable from a client component
 * (`server-only`).
 *
 * Calls the official Notion API over `fetch` (no SDK), with the API
 * version pinned, and only its read endpoints: retrieve a database, data
 * source or page, list a page's blocks (to find the database on it), and
 * query a data source. Nothing is ever created, updated or deleted.
 *
 * One sync reads every row of the roadmap database, maps it to the board's
 * shape at once (`mapNotionRows` — nothing else from the workspace is
 * kept), and keeps the result for `CACHE_TTL_MS`; the last good copy is
 * kept indefinitely so a Notion outage shows the last roadmap as stale
 * instead of nothing. A request never waits for a sync: it gets the copy
 * there is now — or `not_connected` before the first sync lands — and a due
 * sync starts in the background, one at a time, cut off after
 * `SYNC_TIMEOUT_MS`.
 */

/* ----------------------------------------------------------------- config */

/**
 * CHLK's "Product Roadmap" database (CHLK Wiki). Not a secret: useless
 * without a token it is shared with. `NOTION_ROADMAP_PAGE_ID` overrides it.
 */
export const DEFAULT_ROADMAP_DATABASE_ID = "7928ae1b-cfc2-45d5-abb3-f5e997cc94e4"

type Env = Record<string, string | undefined>

export const NOTION_API = "https://api.notion.com"
/** Pinned: the data-source API (databases hold one or more data sources). */
export const NOTION_VERSION = "2025-09-03"

export type NotionConfig =
  | { kind: "missing" }
  /** Set, but not something this module will send anywhere. */
  | { kind: "invalid" }
  | { kind: "ok"; token: string; id: string; base: string }

/** Internal integration tokens: `ntn_…` (current) or `secret_…` (older). Nothing else is sent. */
const TOKEN_PATTERN = /^(ntn|secret)_[A-Za-z0-9]{20,}$/
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])
/** notion.so and its www, or a workspace's public notion.site. */
const NOTION_HOST = /^(?:(?:www\.)?notion\.so|[a-z0-9-]+\.notion\.site)$/

const dashed = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

/**
 * `NOTION_ROADMAP_PAGE_ID` → a dashed, lower-case id, or null. Takes a page,
 * database or data-source id — 32 hex digits, with or without the dashes —
 * or a full https notion.so / notion.site link whose last path segment ends
 * in the id ("Roadmap-1f2e…"; a `?v=` view id is ignored). Anything else is
 * refused, never guessed at.
 */
export function parseNotionId(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  const bare = /^[0-9a-f]{32}$/i.test(value)
    ? value
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? value.replace(/-/g, "")
      : fromUrl(value)
  return bare ? dashed(bare.toLowerCase()) : null
}

function fromUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  if (!NOTION_HOST.test(url.hostname)) return null
  const last = url.pathname.split("/").filter(Boolean).pop() ?? ""
  const m = /(?:^|-)([0-9a-f]{32})$/i.exec(last)
  return m ? m[1] : null
}

function mockBase(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (!LOOPBACK.has(url.hostname)) return null
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Read the token and roadmap id (and an optional mock base) from the
 * environment. Both are required. `NOTION_API_BASE` may only point at this
 * machine, and only outside a production build unless
 * `NOTION_ALLOW_MOCK_BASE=1` says so; a base that breaks either rule makes
 * the whole config invalid, so the token is never sent to the wrong place.
 */
export function readNotionConfig(env: Env = process.env): NotionConfig {
  const token = env.NOTION_READONLY_TOKEN?.trim()
  const rawId = env.NOTION_ROADMAP_PAGE_ID?.trim() || DEFAULT_ROADMAP_DATABASE_ID
  if (!token) return { kind: "missing" }
  const id = parseNotionId(rawId)
  if (!TOKEN_PATTERN.test(token) || !id) return { kind: "invalid" }
  const rawBase = env.NOTION_API_BASE?.trim()
  if (!rawBase) return { kind: "ok", token, id, base: NOTION_API }
  const allowed = env.NODE_ENV !== "production" || env.NOTION_ALLOW_MOCK_BASE === "1"
  const base = allowed ? mockBase(rawBase) : null
  return base ? { kind: "ok", token, id, base } : { kind: "invalid" }
}

/* ----------------------------------------------------------------- errors */

/**
 * Failures, by class name only — that is all that is ever logged (a
 * Notion message can quote ids or workspace text).
 */
export class NotionApiError extends Error {
  name = "NotionApiError"
  constructor(readonly status: number) {
    super("notion request failed")
  }
}
/** 401: the token is wrong or revoked. */
export class NotionUnauthorizedError extends NotionApiError {
  name = "NotionUnauthorizedError"
}
/** 403: the integration lacks the "Read content" capability. */
export class NotionForbiddenError extends NotionApiError {
  name = "NotionForbiddenError"
}
/** 404: no such page/database, or it is not shared with the integration. */
export class NotionNotFoundError extends NotionApiError {
  name = "NotionNotFoundError"
}
/** 429. */
export class NotionRateLimitedError extends NotionApiError {
  name = "NotionRateLimitedError"
}
/** The page holds no database the integration can read. */
export class NoRoadmapDatabaseError extends Error {
  name = "NoRoadmapDatabaseError"
}
/** More rows (or blocks) than the hard cap: not complete enough to show. */
export class TooManyRowsError extends Error {
  name = "TooManyRowsError"
}
/** An answer that is not the JSON Notion documents. */
export class InvalidDataError extends Error {
  name = "InvalidDataError"
}

/**
 * A word for the log: the error's class name (set explicitly above, so a
 * minified build keeps it; `TypeError` for a network failure, `AbortError` /
 * `TimeoutError` for a cut-off call), never its message.
 */
export function failureKind(error: unknown) {
  const name = (error as { name?: unknown } | null)?.name
  return typeof name === "string" && /^[A-Za-z]+Error$/.test(name) && name !== "Error" ? name : "UnknownError"
}

/* ------------------------------------------------------------------ fetch */

/** Above this many rows the roadmap is not read (a hard cap, not a truncation). */
export const MAX_ROWS = 1_000
/** Blocks scanned on the page while looking for its database. */
export const MAX_BLOCKS = 500
/** Databases read from one page. */
export const MAX_DATABASES = 5
/** One call's own limit, inside the sync's. */
export const REQUEST_TIMEOUT_MS = 20_000
const PAGE_SIZE = 100

type Ok = Extract<NotionConfig, { kind: "ok" }>
type Json = Record<string, unknown>

export type NotionRequest = (path: string, body?: Json) => Promise<Json>

/**
 * GET (no body) or POST (a query body) to the Notion API with the token as
 * a Bearer header and the pinned version. Redirects are refused, so the
 * token goes to one origin only.
 */
export function notionRequest(config: Ok, signal?: AbortSignal, fetcher: typeof fetch = fetch): NotionRequest {
  return async (path, body) => {
    const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(signal ? [signal] : [])]
    const res = await fetcher(`${config.base}/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Notion-Version": NOTION_VERSION,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any(signals),
    })
    if (!res.ok) {
      // The body is read only to free the connection; its text is never used.
      await res.body?.cancel().catch(() => {})
      if (res.status === 401) throw new NotionUnauthorizedError(res.status)
      if (res.status === 403) throw new NotionForbiddenError(res.status)
      if (res.status === 404) throw new NotionNotFoundError(res.status)
      if (res.status === 429) throw new NotionRateLimitedError(res.status)
      throw new NotionApiError(res.status)
    }
    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new InvalidDataError()
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) throw new InvalidDataError()
    return json as Json
  }
}

const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null)
const str = (v: unknown) => (typeof v === "string" ? v : null)

/** A 400 or 404 on a "retrieve X" means the id is not an X (or is not shared). */
const notThisKind = (error: unknown) =>
  error instanceof NotionNotFoundError || (error instanceof NotionApiError && error.status === 400)

async function attempt<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch (error) {
    if (notThisKind(error)) return null
    throw error
  }
}

/** Every page of a paginated list, up to `cap` results; over it throws `TooManyRowsError`. */
async function collect(next: (cursor: string | undefined) => Promise<Json>, cap: number): Promise<unknown[]> {
  const out: unknown[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await next(cursor)
    if (!Array.isArray(page.results)) throw new InvalidDataError()
    out.push(...page.results)
    if (out.length > cap) throw new TooManyRowsError()
    if (page.has_more !== true) return out
    cursor = str(page.next_cursor) ?? undefined
    if (!cursor) throw new InvalidDataError()
  }
}

const id = (value: string) => encodeURIComponent(value)

function dataSourceIds(database: Json): string[] {
  if (str(database.object) !== "database" || !Array.isArray(database.data_sources)) throw new InvalidDataError()
  return database.data_sources.map((ds) => str(obj(ds)?.id)).filter((x): x is string => Boolean(x))
}

const CONTAINERS = new Set(["column_list", "column", "toggle", "synced_block", "tab"])

/**
 * The databases on a page, in page order, with their titles: its
 * `child_database` blocks, looking one level into columns and toggles.
 */
async function childDatabases(request: NotionRequest, pageId: string) {
  const found: Array<{ id: string; title: string }> = []
  let scanned = 0
  const walk = async (blockId: string, depth: number) => {
    const blocks = await collect(
      (cursor) => request(`/blocks/${id(blockId)}/children?page_size=${PAGE_SIZE}${cursor ? `&start_cursor=${id(cursor)}` : ""}`),
      MAX_BLOCKS
    )
    for (const raw of blocks) {
      if (++scanned > MAX_BLOCKS) throw new TooManyRowsError()
      const block = obj(raw)
      const type = str(block?.type)
      const blockId = str(block?.id)
      if (!block || !blockId) continue
      if (type === "child_database") found.push({ id: blockId, title: str(obj(block.child_database)?.title) ?? "" })
      else if (depth < 2 && block.has_children === true && type && CONTAINERS.has(type)) await walk(blockId, depth + 1)
    }
  }
  await walk(pageId, 0)
  return found
}

/**
 * The data sources to read for `config.id`: a database's, a data source
 * itself, or — for a page — those of the database on it. A page with
 * several databases uses the ones titled "Roadmap" (any case), else the
 * first. Linked databases the API cannot open are skipped.
 */
export async function resolveDataSources(request: NotionRequest, target: string): Promise<string[]> {
  const database = await attempt(() => request(`/databases/${id(target)}`))
  if (database) return dataSourceIds(database)

  const source = await attempt(() => request(`/data_sources/${id(target)}`))
  if (source) {
    if (str(source.object) !== "data_source") throw new InvalidDataError()
    return [target]
  }

  // Not a database or data source: it must be a page the integration can see.
  const page = await request(`/pages/${id(target)}`)
  if (str(page.object) !== "page") throw new InvalidDataError()
  const children = await childDatabases(request, target)
  const titled = children.filter((c) => /roadmap/i.test(c.title))
  const chosen = (titled.length > 0 ? titled : children.slice(0, 1)).slice(0, MAX_DATABASES)
  const ids: string[] = []
  for (const child of chosen) {
    const db = await attempt(() => request(`/databases/${id(child.id)}`))
    if (db) ids.push(...dataSourceIds(db))
  }
  if (ids.length === 0) throw new NoRoadmapDatabaseError()
  return ids
}

export type Loader = (config: Ok, signal?: AbortSignal) => Promise<LiveRoadmap>

/**
 * One full read: resolve the database, query each data source to the end
 * (100 rows a page, `MAX_ROWS` in all), and map. Raw rows are dropped as
 * soon as they are mapped.
 */
export const loadFromNotion: Loader = async (config, signal) => {
  const request = notionRequest(config, signal)
  const sources = await resolveDataSources(request, config.id)
  const rows: unknown[] = []
  for (const source of sources) {
    const got = await collect(
      (cursor) => request(`/data_sources/${id(source)}/query`, { page_size: PAGE_SIZE, ...(cursor ? { start_cursor: cursor } : {}) }),
      MAX_ROWS - rows.length
    )
    rows.push(...got)
  }
  return mapNotionRows(rows)
}

/* ------------------------------------------------------------------ cache */

/** How long a good sync is served before the next request re-reads Notion. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying Notion again. */
export const RETRY_AFTER_MS = 60_000

type Snapshot = { roadmap: LiveRoadmap; syncedAt: number }

export type NotionService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  roadmap(): Promise<NotionRoadmapSummary>
  health(): Promise<NotionHealth>
  /** Settles when the background sync running now (if any) is done (for `after()`). */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createNotionService({
  env = () => process.env,
  load = loadFromNotion,
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[notion] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): NotionService {
  let lastGood: Snapshot | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  /** Bumped by `reset()`, so a sync started before it cannot write after it. */
  let generation = 0

  async function sync(config: Ok) {
    const at = clock()
    const mine = generation
    try {
      const roadmap = await withTimeout((signal) => load(config, signal), timeoutMs)
      if (mine !== generation) return
      lastGood = { roadmap, syncedAt: at }
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
    const config = readNotionConfig(env())
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
    async roadmap() {
      const { fresh, configured } = read()
      const snapshot = lastGood
      if (!snapshot) return NOTION_NOT_CONNECTED
      return {
        // Token or id removed after a good sync: the last copy, as stale.
        status: fresh && configured ? "connected" : "stale",
        lastSyncedAt: new Date(snapshot.syncedAt).toISOString(),
        roadmap: snapshot.roadmap,
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
export const notionService = createNotionService()
