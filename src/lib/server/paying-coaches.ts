import "server-only"

import {
  PAYING_CONNECTING,
  PAYING_NOT_CONNECTED,
  TOTAL_ROW,
  countsFromRows,
  type PayingCoachesSummary,
  type PayingCounts,
} from "@/lib/paying-coaches"
import {
  CACHE_TTL_MS,
  RETRY_AFTER_MS,
  STATEMENT_TIMEOUT_MS,
  failureKind,
  readAppStoreConfig,
  sslOption,
  type Connect,
} from "@/lib/server/app-store"
import { SYNC_TIMEOUT_MS, withTimeout } from "@/lib/server/time-limit"
import postgres from "postgres"

/**
 * Paying coaches by method, read from Chlk's Supabase Postgres through the
 * same read-only, server-only `SUPABASE_READONLY_DB_URL` the App Store
 * count uses (its role already has SELECT on `chlk.subscriptions`). No new
 * setting. The URL never leaves the server: not logged, not returned.
 *
 * One read per `CACHE_TTL_MS` (5 min), in the background; the last good
 * counts are kept, so an outage shows them as stale (as `stripe.ts` does).
 * Schema owner: Radcliffe.
 */
export const PAYING_COACHES_SQL = `select method, count(distinct user_id)::int as n
from chlk.subscriptions
where subscription_status = 'active'
group by method
union all
select '${TOTAL_ROW}', count(distinct user_id)::int
from chlk.subscriptions
where subscription_status = 'active'`

type Env = Record<string, string | undefined>
export type PayingQuery = (url: string) => Promise<PayingCounts>

export function postgresPayingQuery(connect: Connect = postgres as unknown as Connect): PayingQuery {
  return async (url) => {
    const sql = connect(url, {
      max: 1,
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
        return tx.unsafe(PAYING_COACHES_SQL)
      })
      const counts = countsFromRows(rows)
      if (!counts) throw new InvalidDataError()
      return counts
    } finally {
      await sql.end({ timeout: 5 }).catch(() => {})
    }
  }
}

class InvalidDataError extends Error {}

export interface PayingSource {
  /** Never rejects, never waits for the database. */
  read(): Promise<PayingCoachesSummary>
  settled?(): Promise<void>
}

export function createPayingSource({
  env = () => process.env,
  query = postgresPayingQuery(),
  clock = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  retryMs = RETRY_AFTER_MS,
  timeoutMs = SYNC_TIMEOUT_MS,
  log = (kind: string) => console.warn(`[paying-coaches] read failed: ${kind}`),
}: {
  env?: () => Env
  query?: PayingQuery
  clock?: () => number
  ttlMs?: number
  retryMs?: number
  timeoutMs?: number
  log?: (kind: string) => void
} = {}): Required<PayingSource> & { reset(): void } {
  let lastGood: { counts: PayingCounts; at: number } | null = null
  let lastAttempt: { at: number; ok: boolean } | null = null
  let inflight: Promise<void> | null = null
  let generation = 0

  async function sync(url: string) {
    const at = clock()
    const mine = generation
    try {
      const counts = await withTimeout(() => query(url), timeoutMs)
      if (mine !== generation) return
      lastGood = { counts, at }
      lastAttempt = { at, ok: true }
    } catch (error) {
      if (mine !== generation) return
      lastAttempt = { at: clock(), ok: false }
      log(failureKind(error))
    }
  }

  function read(): PayingCoachesSummary {
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
    if (!lastGood) return config.kind === "ok" && !lastAttempt ? PAYING_CONNECTING : PAYING_NOT_CONNECTED
    const fresh = config.kind === "ok" && Boolean(lastAttempt?.ok)
    return { status: fresh ? "connected" : "stale", counts: lastGood.counts, asOf: new Date(lastGood.at).toISOString() }
  }

  return {
    async read() {
      try {
        return read()
      } catch (error) {
        log(failureKind(error))
        return PAYING_NOT_CONNECTED
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

const defaultSource = createPayingSource()
let current: PayingSource = defaultSource

export function payingSource(): PayingSource {
  return current
}

/** Tests only: swap the source; `null` puts the default back. */
export function setPayingSource(source: PayingSource | null) {
  current = source ?? defaultSource
}
