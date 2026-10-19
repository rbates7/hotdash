import "server-only"

import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"
import {
  MERGED_LOOKBACK_DAYS,
  hasConflict,
  notConnected,
  toWorkboardItem,
  type CheckRun,
  type CombinedStatus,
  type PullDetails,
  type PullSummary,
  type Review,
  type WorkboardItem,
  type WorkboardResponse,
} from "@/lib/workboard"

/**
 * rbates7/hotdash's pull requests from the GitHub REST API — GET only,
 * server only. The token lives in one server env var and never leaves this
 * module: it is not logged, not returned, and nothing here is importable
 * from a client component (`server-only`).
 *
 * One sync lists every open PR and the closed ones merged in the last
 * `MERGED_LOOKBACK_DAYS`, and for each open PR reads its mergeable state,
 * the head commit's check runs and combined status, and its reviews. The
 * result is kept for `CACHE_TTL_MS`, and the last good copy is kept
 * indefinitely so a GitHub outage shows the last board as stale instead of
 * nothing.
 *
 * Like the Stripe service (`@/lib/server/stripe`), a request never waits
 * for a sync: it gets the copy there is now — or `connected: false` with no
 * items before the first sync lands — and a due sync starts in the
 * background, one at a time, cut off after `SYNC_TIMEOUT_MS`.
 */

/* ----------------------------------------------------------------- config */

type Env = Record<string, string | undefined>

export const REPO = "rbates7/hotdash"
const API = "https://api.github.com"

/** GitHub tokens are word characters only; anything else is never sent. */
const TOKEN_PATTERN = /^[A-Za-z0-9_]{20,255}$/

export type WorkboardConfig = { kind: "missing" } | { kind: "invalid" } | { kind: "ok"; token: string }

/**
 * `GITHUB_READONLY_TOKEN` first; `github_read_only` (the name the token has
 * in Vercel) as a fallback.
 */
export function readWorkboardConfig(env: Env = process.env): WorkboardConfig {
  const token = env.GITHUB_READONLY_TOKEN?.trim() || env.github_read_only?.trim()
  if (!token) return { kind: "missing" }
  return TOKEN_PATTERN.test(token) ? { kind: "ok", token } : { kind: "invalid" }
}

/* ----------------------------------------------------------------- fetch */

/** Pages of 100: past this, a list is not complete enough to show. */
const MAX_PAGES = 10
/** Open PRs read at once, to stay well inside GitHub's secondary limits. */
const DETAIL_CONCURRENCY = 4

class GitHubError extends Error {
  constructor(readonly type: "GitHubHttpError" | "IncompleteData") {
    super(type)
  }
}

export type Loader = (token: string, now: Date, signal?: AbortSignal) => Promise<WorkboardItem[]>

export function createGitHubLoader(fetchImpl: typeof fetch = (...args) => fetch(...args)): Loader {
  return async (token, now, signal) => {
    async function get<T>(path: string): Promise<T> {
      const res = await fetchImpl(`${API}/repos/${REPO}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "hotdash-founder-dashboard",
        },
        cache: "no-store",
        signal,
      })
      if (!res.ok) throw new GitHubError("GitHubHttpError")
      return (await res.json()) as T
    }

    /** Pages of `path` until a short page, or until `more` says stop. */
    async function list<T>(path: string, more: (page: T[]) => boolean = () => true): Promise<T[]> {
      const out: T[] = []
      for (let page = 1; page <= MAX_PAGES; page++) {
        const rows = await get<T[]>(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`)
        out.push(...rows)
        if (rows.length < 100 || !more(rows)) return out
      }
      throw new GitHubError("IncompleteData")
    }

    const cutoff = now.getTime() - MERGED_LOOKBACK_DAYS * 86_400_000
    const recent = (iso: string | null) => iso !== null && Date.parse(iso) >= cutoff
    const [open, closed] = await Promise.all([
      list<PullSummary>("/pulls?state=open"),
      // Newest-updated first: a PR merged since the cutoff was updated since
      // it, so the first page that ends before the cutoff is the last needed.
      list<PullSummary>("/pulls?state=closed&sort=updated&direction=desc", (rows) =>
        recent(rows[rows.length - 1].updated_at)
      ),
    ])

    async function details(pr: PullSummary): Promise<PullDetails> {
      const sha = encodeURIComponent(pr.head.sha)
      const [detail, checks, status, reviews] = await Promise.all([
        get<{ mergeable: boolean | null; mergeable_state?: string | null }>(`/pulls/${pr.number}`),
        get<{ check_runs: CheckRun[] }>(`/commits/${sha}/check-runs?per_page=100`),
        get<CombinedStatus>(`/commits/${sha}/status`),
        list<Review>(`/pulls/${pr.number}/reviews`),
      ])
      return { checkRuns: checks.check_runs, status, reviews, conflict: hasConflict(detail) }
    }

    const items: WorkboardItem[] = []
    for (let i = 0; i < open.length; i += DETAIL_CONCURRENCY) {
      const batch = open.slice(i, i + DETAIL_CONCURRENCY)
      const done = await Promise.all(batch.map(async (pr) => toWorkboardItem(pr, await details(pr))))
      items.push(...done)
    }
    for (const pr of closed) if (recent(pr.merged_at)) items.push(toWorkboardItem(pr, null))
    return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }
}

export const loadFromGitHub = createGitHubLoader()

/** A word for the log, never an error's message or a response body. */
export function failureKind(error: unknown) {
  const type = (error as { type?: unknown } | null)?.type
  if (typeof type === "string" && /^(GitHubHttpError|IncompleteData|SyncTimeout)$/.test(type)) return type
  return "UnknownError"
}

/* ----------------------------------------------------------------- cache */

/** How long a good sync is served before the next request re-reads GitHub. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) sync, wait this long before trying GitHub again. */
export const RETRY_AFTER_MS = 60_000

export type WorkboardService = {
  /** Answers at once from the copy there is; never waits for a sync. */
  read(): Promise<WorkboardResponse>
  /**
   * True while a usable token is set and the first sync has not finished:
   * `read()` says `connected: false`, but the board is on its way. A failed
   * first sync is not connecting (no "connecting forever").
   */
  connecting(): boolean
  /** Settles when the background sync running now (if any) is done. */
  settled(): Promise<void>
  /** Tests only: forget everything. */
  reset(): void
}

export function createWorkboardService({
  env = () => process.env,
  load = loadFromGitHub,
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[workboard] sync failed: ${kind}`),
}: {
  env?: () => Env
  load?: Loader
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): WorkboardService {
  let lastGood: { items: WorkboardItem[]; syncedAt: number } | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  /** Bumped by `reset()`, so a sync started before it cannot write after it. */
  let generation = 0

  async function sync(token: string) {
    const at = clock()
    const mine = generation
    try {
      const items = await withTimeout((signal) => load(token, new Date(at), signal), timeoutMs)
      if (mine !== generation) return
      lastGood = { items, syncedAt: at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      // Retry a minute after it failed, not after it started.
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  return {
    async read() {
      const config = readWorkboardConfig(env())
      if (config.kind !== "ok") return notConnected(new Date(clock()))
      const age = lastAttempt ? clock() - lastAttempt.at : Infinity
      const due = !lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)
      if (due && !inflight) {
        const run: Promise<void> = sync(config.token).finally(() => {
          if (inflight === run) inflight = null
        })
        inflight = run
      }
      const snapshot = lastGood
      if (!snapshot) return notConnected(new Date(clock()))
      // A refresh running behind a good copy leaves it current; only a
      // failed sync makes it stale.
      return {
        connected: true,
        fetchedAt: new Date(snapshot.syncedAt).toISOString(),
        stale: !lastAttempt?.ok,
        items: snapshot.items,
      }
    },
    connecting() {
      return readWorkboardConfig(env()).kind === "ok" && lastGood === null && lastAttempt === null
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

/** The one cache for this server process. */
export const workboardService = createWorkboardService()
