// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import type { PayingCounts } from "@/lib/paying-coaches"
import { CACHE_TTL_MS, RETRY_AFTER_MS, type Connect } from "@/lib/server/app-store"
import { PAYING_STATUSES } from "@/lib/paying-coaches"
import { PAYING_COACHES_SQL, createPayingSource, postgresPayingQuery } from "@/lib/server/paying-coaches"

/** A made-up URL: loopback, a fake role, never a real database. */
const URL_OK = "postgresql://hotdash_ro:not-a-real-password@127.0.0.1:5432/postgres"
const ENV = { SUPABASE_READONLY_DB_URL: URL_OK }
const T0 = Date.parse("2026-10-19T20:00:00.000Z")
const COUNTS: PayingCounts = { appStore: 4, stripe: 90, invoice: 6, other: 0, total: 100 }

function source(query: (url: string) => Promise<PayingCounts>, env: Record<string, string | undefined> = ENV) {
  let now = T0
  const logs: string[] = []
  const src = createPayingSource({ env: () => env, query, clock: () => now, log: (k) => logs.push(k) })
  return { src, logs, tick: (ms: number) => (now += ms) }
}

describe("PAYING_COACHES_SQL", () => {
  it("is a fixed, read-only, active-only count by method with a rollup", () => {
    expect(PAYING_COACHES_SQL).toMatch(/^select /)
    expect(PAYING_COACHES_SQL).not.toMatch(/\b(insert|update|delete|drop|alter|grant)\b/i)
    expect(PAYING_COACHES_SQL.match(/subscription_status = 'active'/g)).toHaveLength(2)
    expect(PAYING_COACHES_SQL).toContain("group by method")
    expect(PAYING_COACHES_SQL).toContain("count(distinct user_id)")
    expect(PAYING_COACHES_SQL).toContain("'__total__'")
    expect(PAYING_COACHES_SQL).not.toMatch(/email|name\b/i)
  })
})

describe("PAYING_COACHES_SQL status filter (pinned)", () => {
  it("filters on exactly the documented statuses, in both halves, and nothing else", () => {
    const filters = PAYING_COACHES_SQL.match(/where [^\n]*/g)
    expect(filters).toEqual(["where subscription_status = 'active'", "where subscription_status = 'active'"])
    expect(PAYING_STATUSES).toEqual(["active"])
    for (const other of ["past_due", "trialing", "billing_retry", "grace", "canceled", "unpaid", "paused"]) {
      expect(PAYING_COACHES_SQL).not.toContain(other)
    }
    expect(PAYING_COACHES_SQL).not.toMatch(/subscription_status\s+in\s*\(/i)
  })
})

describe("createPayingSource", () => {
  it("no URL: not connected, never queries", async () => {
    const query = vi.fn()
    const { src } = source(query, {})
    expect(await src.read()).toEqual({ status: "not_connected" })
    expect(query).not.toHaveBeenCalled()
  })
  it("a bad URL is not connected", async () => {
    const query = vi.fn()
    const { src } = source(query, { SUPABASE_READONLY_DB_URL: "https://example.supabase.co" })
    expect(await src.read()).toEqual({ status: "not_connected" })
    expect(query).not.toHaveBeenCalled()
  })
  it("connecting, then connected with TLS required", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src } = source(query)
    expect(await src.read()).toEqual({ status: "connecting" })
    await src.settled()
    expect(await src.read()).toEqual({ status: "connected", counts: COUNTS, asOf: new Date(T0).toISOString() })
    expect(query).toHaveBeenCalledWith(`${URL_OK}?sslmode=require`)
  })
  it("caches for the TTL, then reads again", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src, tick } = source(query)
    await src.read()
    await src.settled()
    tick(CACHE_TTL_MS - 1)
    await src.read()
    expect(query).toHaveBeenCalledTimes(1)
    tick(1)
    await src.read()
    expect(query).toHaveBeenCalledTimes(2)
  })
  it("a failure after a good read is stale with the last counts; logs only the class name", async () => {
    let fail = false
    const query = vi.fn(async () => {
      if (fail) throw new TypeError("connect to postgresql://secret@host failed")
      return COUNTS
    })
    const { src, logs, tick } = source(query)
    await src.read()
    await src.settled()
    fail = true
    tick(CACHE_TTL_MS)
    await src.read()
    await src.settled()
    const r = await src.read()
    expect(r).toMatchObject({ status: "stale", counts: COUNTS })
    expect(logs).toEqual(["TypeError"])
    tick(RETRY_AFTER_MS - 1)
    await src.read()
    expect(query).toHaveBeenCalledTimes(2)
  })
  it("a first read that fails is not connected", async () => {
    const { src } = source(async () => {
      throw new Error("x")
    })
    await src.read()
    await src.settled()
    expect(await src.read()).toEqual({ status: "not_connected" })
  })
})

describe("postgresPayingQuery", () => {
  function fake(rows: unknown) {
    const calls: string[] = []
    let options: unknown
    let ended = false
    const connect: Connect = (_url, opts) => {
      options = opts
      return {
        begin: async (mode, fn) => {
          calls.push(`begin ${mode}`)
          return fn({ unsafe: async (q) => (calls.push(q), q === PAYING_COACHES_SQL ? rows : []) })
        },
        end: async () => {
          ended = true
        },
      }
    }
    return { connect, calls, get options() { return options }, get ended() { return ended } }
  }
  it("runs the fixed query in a read-only transaction and closes", async () => {
    const f = fake([
      { method: "AppStore", n: 1 },
      { method: "__total__", n: 1 },
    ])
    const counts = await postgresPayingQuery(f.connect)(URL_OK)
    expect(counts.total).toBe(1)
    expect(f.calls[0]).toBe("begin read only")
    expect(f.calls[1]).toMatch(/statement_timeout/)
    expect(f.options).toMatchObject({ max: 1, prepare: false, ssl: "require" })
    expect(f.ended).toBe(true)
  })
  it("rejects an odd answer", async () => {
    const f = fake([{ method: "Stripe", n: 3 }])
    await expect(postgresPayingQuery(f.connect)(URL_OK)).rejects.toThrow()
    expect(f.ended).toBe(true)
  })
})
