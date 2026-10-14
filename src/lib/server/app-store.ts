import "server-only"

import postgres from "postgres"

import { APP_STORE_NOT_CONNECTED, type AppStoreSummary } from "@/lib/app-store-summary"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"

/**
 * App Store payers — group (2) of the Subscribers total — read from Chlk's
 * Supabase Postgres, read-only, server only. They pay Apple, not Stripe,
 * so Stripe cannot count them.
 *
 * The database URL lives in one server env var and never leaves this
 * module: it is not logged, not returned, and nothing here is importable
 * from a client component (`server-only`). One count per `CACHE_TTL_MS`,
 * read in the background — a request never waits for it, and gets
 * `not_connected` until the first count lands; the last good count is
 * kept, so an outage shows it as stale rather than nothing. Anything that goes wrong — no URL, a bad URL, the database down
 * or slow, an odd answer — is `not_connected` (or `stale`), never a throw:
 * the Stripe figures beside it are never held up or broken by this.
 *
 * Schema owner: Radcliffe (`chlk.subscriptions`, `chlk.plans`).
 */

/* ------------------------------------------------------------------ query */

/**
 * The count, exactly as Rashad and Bobbi verified it read-only on prod
 * (Oct 14 2026): distinct users on an active App Store subscription (or
 * one Apple is retrying) whose plan is an App Store product, and who have
 * no active, past-due or trialing Stripe or invoice subscription — so
 * nobody is counted here and in Stripe. `apple_product_id` is on
 * `chlk.plans`, not `chlk.subscriptions`.
 */
export const APP_STORE_PAYERS_SQL = `select count(distinct a.user_id)::int as n
from chlk.subscriptions a
join chlk.plans p on p.id = a.plan_id
where a.method = 'AppStore'
  and p.apple_product_id is not null
  and a.subscription_status in ('active','billing_retry')
  and not exists (
    select 1 from chlk.subscriptions x
    where x.user_id = a.user_id
      and x.method in ('Stripe','invoice')
      and x.subscription_status in ('active','past_due','trialing')
  )`

/** Postgres gives up on the count after this (and so do we). */
export const STATEMENT_TIMEOUT_MS = 10_000

type Env = Record<string, string | undefined>

export type AppStoreConfig = { kind: "missing" } | { kind: "invalid" } | { kind: "ok"; url: string }

/** `sslmode`s that verify the server's certificate; kept as given. */
const VERIFYING_SSLMODES = new Set(["verify-ca", "verify-full"])

/**
 * `SUPABASE_READONLY_DB_URL`: a `postgres://` / `postgresql://` URL, or
 * nothing is sent anywhere. Always over TLS: no `sslmode` (or one that
 * allows plaintext — `disable`, `allow`, `prefer`) becomes
 * `sslmode=require`; `verify-ca` / `verify-full` are kept.
 */
export function readAppStoreConfig(env: Env = process.env): AppStoreConfig {
  const url = env.SUPABASE_READONLY_DB_URL?.trim()
  if (!url) return { kind: "missing" }
  let sslmode: string | null
  try {
    const parsed = new URL(url)
    if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.hostname) return { kind: "invalid" }
    sslmode = parsed.searchParams.get("sslmode")
  } catch {
    return { kind: "invalid" }
  }
  if (sslmode !== null && VERIFYING_SSLMODES.has(sslmode)) return { kind: "ok", url }
  // String edits, not URL re-serialisation, so the rest of the URL (an
  // encoded password) goes through byte for byte.
  const tls =
    sslmode === null
      ? `${url}${url.includes("?") ? "&" : "?"}sslmode=require`
      : url.replace(/([?&])sslmode=[^&#]*/g, "$1sslmode=require")
  return { kind: "ok", url: tls }
}

/**
 * The `ssl` option for the client: `require`, or the URL's verifying mode
 * (`verify-ca`: check the chain, not the host name). An explicit option
 * outranks the URL in `postgres`, so TLS holds even for a URL that did not
 * come through `readAppStoreConfig`.
 */
export function sslOption(url: string): "require" | "verify-full" | { rejectUnauthorized: true; checkServerIdentity: () => undefined } {
  let mode: string | null = null
  try {
    mode = new URL(url).searchParams.get("sslmode")
  } catch {}
  if (mode === "verify-full") return "verify-full"
  if (mode === "verify-ca") return { rejectUnauthorized: true, checkServerIdentity: () => undefined }
  return "require"
}

/** Counts App Store payers at `url`. Rejects on any failure. */
export type AppStoreQuery = (url: string) => Promise<number>

/** The slice of the `postgres` client this module uses (tests pass a fake). */
export type Connect = (url: string, options: postgres.Options<Record<string, never>>) => {
  begin<T>(mode: string, fn: (tx: { unsafe(query: string): Promise<unknown> }) => Promise<T>): Promise<T>
  end(options?: { timeout?: number }): Promise<void>
}

/**
 * The default provider: one short-lived connection per count (nothing
 * held open between syncs), a `read only` transaction with a statement
 * timeout, and the fixed query above — no parameters, nothing from a
 * request goes into it.
 */
export function postgresQuery(connect: Connect = postgres as unknown as Connect): AppStoreQuery {
  return async (url) => {
    const sql = connect(url, {
      max: 1,
      // Supabase's pooler (transaction mode) does not keep prepared statements.
      prepare: false,
      ssl: sslOption(url),
      connect_timeout: 10,
      idle_timeout: 1,
      onnotice: () => {},
      connection: { application_name: "hotdash-founder-dashboard" },
    })
    try {
      const rows = await sql.begin("read only", async (tx) => {
        await tx.unsafe(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
        return tx.unsafe(APP_STORE_PAYERS_SQL)
      })
      const n = (rows as Array<{ n?: unknown }>)[0]?.n
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new InvalidDataError()
      return n
    } finally {
      await sql.end({ timeout: 5 }).catch(() => {})
    }
  }
}

class InvalidDataError extends Error {}

/**
 * A word for the log: the error's class name, never its message (a
 * connection error can quote the host, user or URL).
 */
export function failureKind(error: unknown) {
  const name = (error as { constructor?: { name?: unknown } } | null)?.constructor?.name
  return typeof name === "string" && /^[A-Za-z]*Error$/.test(name) ? name : "UnknownError"
}

/* ------------------------------------------------------------------ cache */

/** How long a good count is served before the next request reads again. */
export const CACHE_TTL_MS = 5 * 60_000
/** After a failed (or timed-out) read, wait this long before trying again. */
export const RETRY_AFTER_MS = 60_000

/** Where the App Store count comes from. Swappable (`setAppStoreSource`). */
export interface AppStoreSource {
  /** Never rejects, never waits for the database: a failure is `stale` or `not_connected`. */
  read(): Promise<AppStoreSummary>
  /** Settles when the background read running now (if any) is done (for `after()`). */
  settled?(): Promise<void>
}

export function createAppStoreSource({
  env = () => process.env,
  query = postgresQuery(),
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[app-store] read failed: ${kind}`),
}: {
  env?: () => Env
  query?: AppStoreQuery
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): Required<AppStoreSource> & { reset(): void } {
  let lastGood: { count: number; at: number } | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  /** Bumped by `reset()`, so a read started before it cannot write after it. */
  let generation = 0

  async function sync(url: string) {
    const at = clock()
    const mine = generation
    try {
      const count = await withTimeout(() => query(url), timeoutMs)
      if (mine !== generation) return
      lastGood = { count, at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  function read(): AppStoreSummary {
    const config = readAppStoreConfig(env())
    if (config.kind === "ok") {
      const age = lastAttempt ? clock() - lastAttempt.at : Infinity
      if ((!lastAttempt || age >= (lastAttempt.ok ? ttlMs : retryMs)) && !inflight) {
        const run: Promise<void> = sync(config.url).finally(() => {
          if (inflight === run) inflight = null
        })
        inflight = run
      }
    }
    if (!lastGood) return APP_STORE_NOT_CONNECTED
    const fresh = config.kind === "ok" && Boolean(lastAttempt?.ok)
    return { status: fresh ? "connected" : "stale", count: lastGood.count, asOf: new Date(lastGood.at).toISOString() }
  }

  return {
    async read() {
      try {
        return read()
      } catch (error) {
        log(failureKind(error))
        return APP_STORE_NOT_CONNECTED
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

const defaultSource = createAppStoreSource()
let current: AppStoreSource = defaultSource

/** The source for this server process, shared by every route. */
export function appStoreSource(): AppStoreSource {
  return current
}

/** Tests (and only tests): swap the source; `null` puts the default back. */
export function setAppStoreSource(source: AppStoreSource | null) {
  current = source ?? defaultSource
}
