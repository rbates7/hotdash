// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { APP_STORE_NOT_CONNECTED } from "@/lib/app-store-summary"
import {
  SUPABASE_PAYERS_SQL,
  CACHE_TTL_MS,
  RETRY_AFTER_MS,
  STATEMENT_TIMEOUT_MS,
  appStoreSource,
  createAppStoreSource,
  failureKind,
  postgresQuery,
  readAppStoreConfig,
  setAppStoreSource,
  type Connect,
  type SupabaseCounts,
} from "@/lib/server/app-store"
import { SYNC_TIMEOUT_MS } from "@/lib/server/time-limit"

/** A made-up URL: loopback, a fake role, never a real database. */
const URL_OK = "postgresql://hotdash_ro:not-a-real-password@127.0.0.1:5432/postgres"
const ENV = { SUPABASE_READONLY_DB_URL: URL_OK }
/** `URL_OK` as `readAppStoreConfig` hands it on: TLS required. */
const URL_TLS = `${URL_OK}?sslmode=require`
const T0 = Date.parse("2026-10-14T13:00:00.000Z")
/** Real wall time, taken before fake timers replace `performance.now`. */
const wallClock = performance.now.bind(performance)
/** Prod's Oct 14 counts: active App Store payers and invoice coaches. */
const COUNTS: SupabaseCounts = { appStore: 53, invoice: 83 }
const READING = { status: "connected", count: 53, invoice: 83, asOf: new Date(T0).toISOString() }

function source(query: (url: string) => Promise<SupabaseCounts>, env: Record<string, string | undefined> = ENV) {
  let now = T0
  const logs: string[] = []
  const src = createAppStoreSource({ env: () => env, query, clock: () => now, log: (k) => logs.push(k) })
  return { src, logs, tick: (ms: number) => (now += ms) }
}

/** A read that starts a count, then the count itself run to the end. */
async function synced(src: ReturnType<typeof createAppStoreSource>) {
  await src.read()
  await src.settled()
  return src.read()
}

/** A stand-in `postgres` client that records what it was sent. */
function fakeClient(answer: () => Promise<unknown> = async () => [{ app_store: 53, invoice: 83 }]) {
  const sent: string[] = []
  const calls = { url: "", options: null as unknown, mode: "", ended: 0 }
  const connect: Connect = (url, options) => {
    calls.url = url
    calls.options = options
    return {
      async begin(mode, fn) {
        calls.mode = mode
        return fn({
          unsafe: async (q: string) => {
            sent.push(q)
            return q === SUPABASE_PAYERS_SQL ? answer() : []
          },
        })
      },
      async end() {
        calls.ended += 1
      },
    }
  }
  return { connect, sent, calls }
}

describe("readAppStoreConfig", () => {
  it("missing, blank, or not a postgres URL is not connected", () => {
    expect(readAppStoreConfig({})).toEqual({ kind: "missing" })
    expect(readAppStoreConfig({ SUPABASE_READONLY_DB_URL: "  " })).toEqual({ kind: "missing" })
    expect(readAppStoreConfig({ SUPABASE_READONLY_DB_URL: "https://example.supabase.co" })).toEqual({ kind: "invalid" })
    expect(readAppStoreConfig({ SUPABASE_READONLY_DB_URL: "not a url" })).toEqual({ kind: "invalid" })
  })

  it("accepts postgres:// and postgresql://", () => {
    expect(readAppStoreConfig(ENV)).toEqual({ kind: "ok", url: URL_TLS })
    expect(readAppStoreConfig({ SUPABASE_READONLY_DB_URL: URL_OK.replace("postgresql", "postgres") }).kind).toBe("ok")
  })

  it("requires TLS: no sslmode, or a plaintext-allowing one, becomes sslmode=require", () => {
    const url = (u: string) => (readAppStoreConfig({ SUPABASE_READONLY_DB_URL: u }) as { url: string }).url
    expect(url(URL_OK)).toBe(`${URL_OK}?sslmode=require`)
    expect(url(`${URL_OK}?application_name=x`)).toBe(`${URL_OK}?application_name=x&sslmode=require`)
    for (const weak of ["disable", "allow", "prefer", "false", ""]) {
      expect(url(`${URL_OK}?sslmode=${weak}&connect_timeout=5`), weak).toBe(`${URL_OK}?sslmode=require&connect_timeout=5`)
    }
    expect(url(`${URL_OK}?sslmode=require`)).toBe(`${URL_OK}?sslmode=require`)
    // Stronger, certificate-checking modes are kept as given.
    expect(url(`${URL_OK}?sslmode=verify-full`)).toBe(`${URL_OK}?sslmode=verify-full`)
    expect(url(`${URL_OK}?sslmode=verify-ca`)).toBe(`${URL_OK}?sslmode=verify-ca`)
    // The password goes through byte for byte.
    const encoded = "postgresql://ro:p%40ss%2Fw0rd@db.example.supabase.co:6543/postgres"
    expect(url(encoded)).toBe(`${encoded}?sslmode=require`)
  })
})

describe("postgresQuery (the default provider)", () => {
  it("sends exactly the verified SQL, in a read-only transaction with a statement timeout", async () => {
    const { connect, sent, calls } = fakeClient()
    expect(await postgresQuery(connect)(URL_OK)).toEqual(COUNTS)
    expect(calls.url).toBe(URL_OK)
    expect(calls.mode).toBe("read only")
    expect(sent).toEqual([`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`, SUPABASE_PAYERS_SQL])
    expect(calls.options).toMatchObject({ max: 1, prepare: false, ssl: "require" })
    expect(calls.ended).toBe(1)
  })

  it("passes ssl to the client (it outranks the URL): require, or the URL's verifying mode", async () => {
    for (const [u, ssl] of [
      [URL_OK, "require"],
      [`${URL_OK}?sslmode=disable`, "require"],
      [`${URL_OK}?sslmode=verify-full`, "verify-full"],
      [`${URL_OK}?sslmode=verify-ca`, { rejectUnauthorized: true }],
    ] as const) {
      const { connect, calls } = fakeClient()
      await postgresQuery(connect)(u)
      expect(calls.options, u).toMatchObject({ ssl })
    }
  })

  it("the SQL: active App Store and invoice rows only, LEFT JOIN on plans, Stripe overlap excluded", () => {
    const flat = SUPABASE_PAYERS_SQL.replace(/\s+/g, " ").trim()
    expect(flat).toBe(
      "select count(distinct a.user_id) filter (where a.method = 'AppStore' and p.apple_product_id is not null)::int as app_store, " +
        "count(distinct a.user_id) filter (where a.method = 'invoice')::int as invoice " +
        "from chlk.subscriptions a left join chlk.plans p on p.id = a.plan_id " +
        "where a.subscription_status = 'active' and a.method in ('AppStore','invoice') " +
        "and not exists ( select 1 from chlk.subscriptions x where x.user_id = a.user_id and x.method = 'Stripe' " +
        "and x.subscription_status in ('active','past_due','trialing') )"
    )
  })

  it("counts only subscription_status = 'active': never trialing, past_due or billing_retry", () => {
    expect(SUPABASE_PAYERS_SQL).toContain("a.subscription_status = 'active'")
    expect(SUPABASE_PAYERS_SQL).not.toContain("billing_retry")
    // The only other statuses are the Stripe rows that exclude a user, never ones that count.
    const counted = SUPABASE_PAYERS_SQL.slice(0, SUPABASE_PAYERS_SQL.indexOf("not exists"))
    expect(counted).not.toMatch(/trialing|past_due|billing_retry/)
    expect(counted).not.toMatch(/subscription_status\s+in\b/)
    expect(SUPABASE_PAYERS_SQL.match(/subscription_status/g)).toHaveLength(2)
    // Read-only: nothing but a select.
    expect(SUPABASE_PAYERS_SQL).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|truncate)\b/i)
  })

  it("an odd answer is an error, and the connection is still closed", async () => {
    for (const rows of [
      [],
      [{ app_store: "53", invoice: 83 }],
      [{ app_store: 53, invoice: "83" }],
      [{ app_store: -1, invoice: 83 }],
      [{ app_store: 53, invoice: -1 }],
      [{ app_store: 1.5, invoice: 83 }],
      [{ app_store: 53, invoice: 8.3 }],
      [{ app_store: 53 }],
      [{ n: 53 }],
    ]) {
      const { connect, calls } = fakeClient(async () => rows)
      await expect(postgresQuery(connect)(URL_OK)).rejects.toThrow()
      expect(calls.ended).toBe(1)
    }
  })
})

describe("createAppStoreSource", () => {
  it("missing env is not connected, and nothing is queried", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src } = source(query, {})
    expect(await src.read()).toEqual(APP_STORE_NOT_CONNECTED)
    expect(query).not.toHaveBeenCalled()
  })

  it("an invalid URL is not connected, and nothing is queried", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src } = source(query, { SUPABASE_READONLY_DB_URL: "mysql://x@127.0.0.1/db" })
    expect(await src.read()).toEqual(APP_STORE_NOT_CONNECTED)
    expect(query).not.toHaveBeenCalled()
  })

  it("connected: both counts and when they were taken", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src } = source(query)
    expect(await synced(src)).toEqual(READING)
    expect(query).toHaveBeenCalledWith(URL_TLS)
  })

  it("caches for 5 minutes, then reads again", async () => {
    const query = vi.fn(async () => COUNTS)
    const { src, tick } = source(query)
    await synced(src)
    tick(CACHE_TTL_MS - 1)
    await synced(src)
    expect(query).toHaveBeenCalledTimes(1)
    tick(1)
    await synced(src)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("concurrent reads share one background query (single flight), and neither waits for it", async () => {
    let release!: (c: SupabaseCounts) => void
    const query = vi.fn(() => new Promise<SupabaseCounts>((r) => (release = r)))
    const { src } = source(query)
    expect(await Promise.all([src.read(), src.read()])).toEqual([APP_STORE_NOT_CONNECTED, APP_STORE_NOT_CONNECTED])
    release(COUNTS)
    await src.settled()
    expect((await src.read()).status).toBe("connected")
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("a provider error with no good count is not connected — never a 0, never a throw", async () => {
    const { src, logs } = source(async () => {
      throw new TypeError("connect ECONNREFUSED postgresql://hotdash_ro:not-a-real-password@127.0.0.1")
    })
    await expect(synced(src)).resolves.toEqual(APP_STORE_NOT_CONNECTED)
    expect(logs).toEqual(["TypeError"])
  })

  it("a provider error after a good count serves it as stale, and retries after a minute", async () => {
    let fail = false
    const query = vi.fn(async () => {
      if (fail) throw new Error("down")
      return COUNTS
    })
    const { src, tick } = source(query)
    await synced(src)
    fail = true
    tick(CACHE_TTL_MS)
    expect(await synced(src)).toEqual({ ...READING, status: "stale" })
    tick(RETRY_AFTER_MS - 1)
    await synced(src)
    expect(query).toHaveBeenCalledTimes(2)
    fail = false
    tick(1)
    expect((await synced(src)).status).toBe("connected")
  })

  it("the URL removed after a good count: stale, not queried", async () => {
    const env: Record<string, string | undefined> = { ...ENV }
    const query = vi.fn(async () => COUNTS)
    const { src } = source(query, env)
    await synced(src)
    delete env.SUPABASE_READONLY_DB_URL
    expect((await src.read()).status).toBe("stale")
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("never logs the URL, the password or the message — only the error's class name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const src = createAppStoreSource({
      env: () => ENV,
      query: async () => {
        throw new Error(`password authentication failed for ${URL_OK}`)
      },
    })
    await synced(src)
    const logged = warn.mock.calls.flat().join(" ")
    expect(logged).toBe("[app-store] read failed: Error")
    expect(logged).not.toContain("not-a-real-password")
    warn.mockRestore()
  })
})

describe("createAppStoreSource never waits for the database", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("a slow first count: not connected at once, connected once it lands", async () => {
    vi.useFakeTimers({ now: T0 })
    const src = createAppStoreSource({ env: () => ENV, query: () => new Promise((r) => setTimeout(() => r(COUNTS), 200_000)) })
    const started = wallClock()
    expect(await src.read()).toEqual(APP_STORE_NOT_CONNECTED)
    expect(wallClock() - started).toBeLessThan(1_000)
    await vi.advanceTimersByTimeAsync(200_000)
    expect(await src.read()).toEqual(READING)
  })

  it("a count over the time limit is a failure: the last good count is stale, retried a minute later", async () => {
    vi.useFakeTimers({ now: T0 })
    const logs: string[] = []
    const query = vi.fn(async () => COUNTS)
    const src = createAppStoreSource({ env: () => ENV, query, log: (k) => logs.push(k) })
    await synced(src)

    query.mockImplementation(() => new Promise(() => {})) // never answers
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect((await src.read()).status).toBe("connected")
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(logs).toEqual(["SyncTimeoutError"])
    expect(await src.read()).toEqual({ ...READING, status: "stale" })

    query.mockImplementation(async () => ({ appStore: 54, invoice: 84 }))
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await src.read()
    expect(query).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(await synced(src)).toMatchObject({ status: "connected", count: 54, invoice: 84 })
  })
})

describe("failureKind", () => {
  it("is a class name or UnknownError", () => {
    class PostgresError extends Error {}
    expect(failureKind(new PostgresError("relation chlk.plans does not exist"))).toBe("PostgresError")
    expect(failureKind(new RangeError("x"))).toBe("RangeError")
    expect(failureKind("postgresql://secret")).toBe("UnknownError")
    expect(failureKind(null)).toBe("UnknownError")
    expect(failureKind({ constructor: { name: "postgresql://u:p@h" } })).toBe("UnknownError")
  })
})

describe("setAppStoreSource (swapping the provider)", () => {
  it("swaps the process-wide source, and null puts the default back", async () => {
    const original = appStoreSource()
    const fake = { read: async () => ({ status: "connected" as const, count: 7, asOf: new Date(T0).toISOString() }) }
    setAppStoreSource(fake)
    expect(appStoreSource()).toBe(fake)
    expect((await appStoreSource().read()).status).toBe("connected")
    setAppStoreSource(null)
    expect(appStoreSource()).toBe(original)
  })
})
