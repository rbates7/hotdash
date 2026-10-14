// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GmailThreadMeta } from "@/lib/crm/gmail-mapping"
import { gmailNotConnected } from "@/lib/crm/gmail-summary"
import {
  CACHE_TTL_MS,
  GMAIL_API,
  MAX_THREADS,
  RETRY_AFTER_MS,
  THREAD_QUERY,
  TOKEN_URL,
  createGmailService,
  failureKind,
  gmailLoader,
  readGmailConfig,
  slimThread,
  type GmailService,
  type Loader,
} from "@/lib/server/gmail"
import { SYNC_TIMEOUT_MS, SyncTimeoutError } from "@/lib/server/time-limit"
import { gmailApiThread, gmailFixtureThreads } from "@/test/gmail-fixture"

/** Fake credentials: shaped like Google's, valid nowhere. */
const CLIENT_ID = "123456-hotdashunittest.apps.googleusercontent.com"
const SECRET = "GOCSPX-hotdashUnitTestOnlySecret0"
const REFRESH = "1//hotdashUnitTestOnlyRefreshToken0"
const ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: SECRET, GMAIL_REFRESH_TOKEN: REFRESH }
const SECRETS = [CLIENT_ID, SECRET, REFRESH, "ya29.unit-test-access-token"]
const NOW = new Date("2026-10-14T17:00:00.000Z")
const THREADS = gmailFixtureThreads(NOW.getTime())
const NOT_CONNECTED = gmailNotConnected()

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

function service(load: Loader, env: Record<string, string | undefined> = ENV) {
  const log = vi.fn()
  const svc = createGmailService({ env: () => env, load, log })
  return { svc, log }
}

async function synced(svc: GmailService) {
  await svc.summary()
  await svc.settled()
  return svc.summary()
}

/* ---------------------------------------------------------------- config */

describe("readGmailConfig", () => {
  it("is missing with nothing set, invalid with only some, ok with all three", () => {
    expect(readGmailConfig({})).toEqual({ kind: "missing", mailbox: "info@chlkapp.com" })
    expect(readGmailConfig({ GMAIL_CLIENT_ID: " ", GMAIL_REFRESH_TOKEN: "" })).toMatchObject({ kind: "missing" })
    expect(readGmailConfig({ GMAIL_CLIENT_ID: CLIENT_ID })).toMatchObject({ kind: "invalid" })
    expect(readGmailConfig({ ...ENV, GMAIL_REFRESH_TOKEN: undefined })).toMatchObject({ kind: "invalid" })
    expect(readGmailConfig(ENV)).toEqual({
      kind: "ok",
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      refreshToken: REFRESH,
      mailbox: "info@chlkapp.com",
    })
  })

  it("refuses a client ID that is not Google's, and secrets with whitespace", () => {
    for (const bad of [
      { GMAIL_CLIENT_ID: "123.example.com" },
      { GMAIL_CLIENT_SECRET: "has space inside" },
      { GMAIL_REFRESH_TOKEN: "short" },
      { GMAIL_MAILBOX: "not-an-address" },
    ]) {
      expect(readGmailConfig({ ...ENV, ...bad })).toMatchObject({ kind: "invalid" })
    }
  })

  it("reads GMAIL_MAILBOX, trimmed and lower-cased", () => {
    expect(readGmailConfig({ ...ENV, GMAIL_MAILBOX: " Help@ChlkApp.com " })).toMatchObject({ kind: "ok", mailbox: "help@chlkapp.com" })
    expect(readGmailConfig({ GMAIL_MAILBOX: "help@chlkapp.com" })).toEqual({ kind: "missing", mailbox: "help@chlkapp.com" })
  })
})

/* ------------------------------------------------------- never waits */

describe("never waits for a sync", () => {
  it("cold start: answers not_connected at once while a sync runs, then connected once it lands", async () => {
    const load = vi.fn<Loader>(() => new Promise((r) => setTimeout(() => r(THREADS), 30_000)))
    const { svc } = service(load)

    expect(await svc.summary()).toEqual(NOT_CONNECTED)
    expect(await svc.health()).toBe("error")
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    const after = await svc.summary()
    expect(after.status).toBe("connected")
    expect(after.lastSyncedAt).toBe(NOW.toISOString())
    expect(after.mailbox).toBe("info@chlkapp.com")
    expect(after.data?.cases).toHaveLength(4)
    expect(await svc.health()).toBe("ok")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a sync over the time limit is aborted, logged, retried a minute later; the last good copy is kept as stale", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc, log } = service(load)
    const good = await synced(svc)

    let signal: AbortSignal | undefined
    load.mockImplementation((_c, s) => {
      signal = s
      return new Promise(() => {})
    })
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect((await svc.summary()).status).toBe("connected")

    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeout")
    expect(signal?.aborted).toBe(true)
    expect(await svc.summary()).toEqual({ ...good, status: "stale" })
    expect(await svc.health()).toBe("error")

    load.mockImplementation(async () => THREADS)
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await svc.summary()
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect((await synced(svc)).status).toBe("connected")
    expect(load).toHaveBeenCalledTimes(3)
  })
})

/* ----------------------------------------------------------------- cache */

describe("cache", () => {
  it("serves one sync for 5 minutes, then reads Gmail again", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc } = service(load)
    await synced(svc)
    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    await synced(svc)
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await synced(svc)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("concurrent requests share one background sync", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc } = service(load)
    await Promise.all([svc.summary(), svc.summary(), svc.health()])
    await svc.settled()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a sync started before reset() cannot write after it", async () => {
    let release!: (t: GmailThreadMeta[]) => void
    const { svc } = service(() => new Promise((r) => (release = r)))
    await svc.summary()
    svc.reset()
    release(THREADS)
    await Promise.resolve()
    expect(await svc.summary()).toEqual(NOT_CONNECTED)
  })
})

/* -------------------------------------------------------------- fallback */

describe("fallback", () => {
  it("never synced and Gmail fails → not_connected, logged by kind only", async () => {
    const { svc, log } = service(async () => {
      throw new Error(`invalid_grant for ${REFRESH}`)
    })
    expect(await synced(svc)).toEqual(NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("UnknownError")
    expect(JSON.stringify(log.mock.calls)).not.toContain(REFRESH)
  })

  it("a failure after a good sync → stale, with the last good threads and their time", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc } = service(load)
    const good = await synced(svc)
    load.mockRejectedValue(new Error("boom"))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    const stale = await synced(svc)
    expect(stale).toEqual({ ...good, status: "stale" })
  })

  it("no credentials → not_connected / not_configured, and Gmail is never called", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc } = service(load, {})
    expect(await synced(svc)).toEqual(NOT_CONNECTED)
    expect(await svc.health()).toBe("not_configured")
    expect(load).not.toHaveBeenCalled()
  })

  it("invalid credentials → not_configured, and nothing is sent", async () => {
    const load = vi.fn<Loader>(async () => THREADS)
    const { svc } = service(load, { ...ENV, GMAIL_CLIENT_ID: "nope" })
    expect(await svc.health()).toBe("not_configured")
    expect(load).not.toHaveBeenCalled()
  })

  it("credentials removed after a good sync → stale with the last threads", async () => {
    const env: Record<string, string | undefined> = { ...ENV }
    const svc = createGmailService({ env: () => env, load: async () => THREADS, log: () => {} })
    const good = await synced(svc)
    delete env.GMAIL_REFRESH_TOKEN
    expect(await svc.summary()).toEqual({ ...good, status: "stale" })
    expect(await svc.health()).toBe("not_configured")
  })

  it("threads that do not map cleanly are a failed sync, not a crash", async () => {
    const { svc, log } = service(async () => [{ id: "a", messages: null }] as unknown as GmailThreadMeta[])
    expect(await synced(svc)).toEqual(NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("InvalidData")
  })

  it("failureKind names fixed words only, never a message", () => {
    expect(failureKind({ type: "GmailAuth", message: SECRET })).toBe("GmailAuth")
    expect(failureKind(new Error(SECRET))).toBe("UnknownError")
    expect(failureKind({ type: SECRET })).toBe("UnknownError")
    expect(failureKind(null)).toBe("UnknownError")
    expect(failureKind(new SyncTimeoutError())).toBe("SyncTimeout")
    expect(failureKind(Object.assign(new Error("x"), { name: "AbortError" }))).toBe("Aborted")
  })
})

/* -------------------------------------------------- the REST calls (faked) */

type Call = { url: string; init: RequestInit | undefined }

function fakeGoogle(overrides: { token?: () => Response; list?: () => Response; thread?: (id: string) => Response } = {}) {
  const calls: Call[] = []
  const byId = new Map(THREADS.map((t) => [t.id, gmailApiThread(t)]))
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url === TOKEN_URL) {
      return overrides.token?.() ?? Response.json({ access_token: SECRETS[3], expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.readonly", token_type: "Bearer" })
    }
    const u = new URL(url)
    if (u.pathname.endsWith("/threads")) {
      return overrides.list?.() ?? Response.json({ threads: [...byId.keys()].map((id) => ({ id, snippet: "x", historyId: "1" })), resultSizeEstimate: byId.size })
    }
    const id = u.pathname.split("/").pop()!
    return overrides.thread?.(id) ?? Response.json(byId.get(id))
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  return { calls, fetchImpl }
}

const CONFIG = readGmailConfig(ENV) as Extract<ReturnType<typeof readGmailConfig>, { kind: "ok" }>

describe("gmailLoader (fetch faked, never real Google)", () => {
  it("exchanges the refresh token, then lists and reads metadata only, with the access token", async () => {
    vi.useRealTimers()
    const { calls, fetchImpl } = fakeGoogle()
    const signal = new AbortController().signal
    const threads = await gmailLoader(fetchImpl)(CONFIG, signal)

    expect(threads.map((t) => t.id).sort()).toEqual(THREADS.map((t) => t.id).sort())
    expect(threads.find((t) => t.id === THREADS[0]!.id)).toEqual(THREADS[0])

    const [token, list, ...gets] = calls
    expect(token!.url).toBe(TOKEN_URL)
    expect(token!.init?.method).toBe("POST")
    expect(Object.fromEntries(token!.init!.body as URLSearchParams)).toEqual({
      client_id: CLIENT_ID,
      client_secret: SECRET,
      refresh_token: REFRESH,
      grant_type: "refresh_token",
    })

    const listUrl = new URL(list!.url)
    expect(`${listUrl.origin}${listUrl.pathname}`).toBe(`${GMAIL_API}/info%40chlkapp.com/threads`)
    expect(listUrl.searchParams.get("q")).toBe(THREAD_QUERY)
    expect(listUrl.searchParams.get("maxResults")).toBe(String(MAX_THREADS))

    expect(gets).toHaveLength(THREADS.length)
    for (const call of [list!, ...gets]) {
      expect(call.init?.method ?? "GET").toBe("GET")
      expect((call.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRETS[3]}`)
      expect(call.init?.signal).toBe(signal)
    }
    for (const call of gets) {
      const u = new URL(call.url)
      expect(u.searchParams.get("format")).toBe("metadata")
      expect(u.searchParams.getAll("metadataHeaders")).toEqual(["From", "To", "Subject"])
    }
    expect(token!.init?.signal).toBe(signal)
    // Only Google's two hosts, and the secret only ever in the token POST body.
    expect(new Set(calls.map((c) => new URL(c.url).host))).toEqual(new Set(["oauth2.googleapis.com", "gmail.googleapis.com"]))
    for (const call of calls) {
      expect(call.url).not.toContain(SECRET)
      expect(call.url).not.toContain(REFRESH)
    }
  })

  it("a refused token is GmailAuth, with none of Google's text", async () => {
    vi.useRealTimers()
    const { fetchImpl } = fakeGoogle({ token: () => Response.json({ error: "invalid_grant", error_description: REFRESH }, { status: 400 }) })
    const error = await gmailLoader(fetchImpl)(CONFIG).catch((e: unknown) => e)
    expect(failureKind(error)).toBe("GmailAuth")
    expect(String((error as Error).message)).not.toContain(REFRESH)
  })

  it.each([
    [403, "GmailAuth"],
    [429, "GmailRateLimited"],
    [500, "GmailApi"],
  ])("a %i from Gmail is %s", async (status, kind) => {
    vi.useRealTimers()
    const { fetchImpl } = fakeGoogle({ thread: () => Response.json({ error: { message: "nope" } }, { status }) })
    expect(failureKind(await gmailLoader(fetchImpl)(CONFIG).catch((e: unknown) => e))).toBe(kind)
  })

  it("an empty inbox is no threads; odd ids are never requested", async () => {
    vi.useRealTimers()
    const empty = fakeGoogle({ list: () => Response.json({ resultSizeEstimate: 0 }) })
    expect(await gmailLoader(empty.fetchImpl)(CONFIG)).toEqual([])
    const odd = fakeGoogle({ list: () => Response.json({ threads: [{ id: "../../drafts" }, { id: 7 }] }) })
    expect(await gmailLoader(odd.fetchImpl)(CONFIG)).toEqual([])
    expect(odd.calls).toHaveLength(2)
  })
})

describe("slimThread", () => {
  it("keeps only the mapper's fields and drops messages without a date", () => {
    const raw = gmailApiThread(THREADS[0]!)
    raw.messages.push({ ...raw.messages[0]!, id: "x", internalDate: "soon" })
    const slim = slimThread(raw)!
    expect(slim).toEqual(THREADS[0])
    expect(JSON.stringify(slim)).not.toContain("sizeEstimate")
    expect(slimThread({ id: "zz-not-hex", messages: [] })).toBeNull()
    expect(slimThread(null)).toBeNull()
  })
})
