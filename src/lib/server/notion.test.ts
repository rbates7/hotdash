// @vitest-environment node
import { readFileSync } from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { NOTION_CONNECTING, NOTION_NOT_CONNECTED, type LiveRoadmap } from "@/lib/notion-roadmap"
import {
  CACHE_TTL_MS,
  MAX_ROWS,
  NOTION_API,
  NOTION_VERSION,
  NoRoadmapDatabaseError,
  NotionNotFoundError,
  NotionUnauthorizedError,
  RETRY_AFTER_MS,
  TooManyRowsError,
  createNotionService,
  failureKind,
  loadFromNotion,
  notionRequest,
  parseNotionId,
  readNotionConfig,
  resolveDataSources,
  type Loader,
  type NotionConfig,
  type NotionRequest,
  type NotionService,
  DEFAULT_ROADMAP_DATABASE_ID,
} from "@/lib/server/notion"
import { SYNC_TIMEOUT_MS, SyncTimeoutError } from "@/lib/server/time-limit"
import { LIVE_ROADMAP, notionRow } from "@/test/notion-fixture"

/** Fake token and ids: shaped like Notion's, valid nowhere. */
const TOKEN = "ntn_hotdashUnitTestOnly0000000000000"
const PAGE_HEX = "1f2e3d4c5b6a79881f2e3d4c5b6a7988"
const PAGE_ID = "1f2e3d4c-5b6a-7988-1f2e-3d4c5b6a7988"
const ENV = { NOTION_READONLY_TOKEN: TOKEN, NOTION_ROADMAP_PAGE_ID: PAGE_HEX, NODE_ENV: "test" }
const NOW = new Date("2026-10-14T17:00:00.000Z")
/** Real wall time, taken before fake timers replace `performance.now`. */
const wallClock = performance.now.bind(performance)

type Ok = Extract<NotionConfig, { kind: "ok" }>

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

function service(load: Loader, env: Record<string, string | undefined> = ENV) {
  const log = vi.fn()
  const svc = createNotionService({ env: () => env, load, log })
  return { svc, log }
}

/** Kick a sync, let it land, and read again. */
async function synced(svc: NotionService) {
  await svc.roadmap()
  await svc.settled()
  return svc.roadmap()
}

/* ------------------------------------------------------------------ config */

describe("parseNotionId", () => {
  it("takes 32 hex digits with or without dashes, in any case", () => {
    expect(parseNotionId(PAGE_HEX)).toBe(PAGE_ID)
    expect(parseNotionId(PAGE_ID)).toBe(PAGE_ID)
    expect(parseNotionId(` ${PAGE_HEX.toUpperCase()} `)).toBe(PAGE_ID)
  })

  it("pulls the id out of a notion.so or notion.site link, ignoring a view id", () => {
    expect(parseNotionId(`https://www.notion.so/chlk/Roadmap-${PAGE_HEX}?v=aaaabbbbccccddddeeeeffff00001111`)).toBe(PAGE_ID)
    expect(parseNotionId(`https://notion.so/${PAGE_HEX}`)).toBe(PAGE_ID)
    expect(parseNotionId(`https://chlk.notion.site/Product-Roadmap-${PAGE_HEX}#top`)).toBe(PAGE_ID)
  })

  it("refuses anything else", () => {
    for (const bad of [
      undefined,
      "",
      "roadmap",
      PAGE_HEX.slice(1),
      `${PAGE_HEX}0`,
      "1f2e3d4c5b6a7988-1f2e3d4c5b6a7988",
      PAGE_HEX.replace("1", "g"),
      `http://www.notion.so/Roadmap-${PAGE_HEX}`,
      `https://evil.example/Roadmap-${PAGE_HEX}`,
      `https://notion.so.evil.example/Roadmap-${PAGE_HEX}`,
      `https://user:pw@www.notion.so/Roadmap-${PAGE_HEX}`,
      `https://www.notion.so:8443/Roadmap-${PAGE_HEX}`,
      `https://www.notion.so/Roadmap?p=${PAGE_HEX}`,
      `https://www.notion.so/Roadmap-${PAGE_HEX}x`,
    ]) {
      expect(parseNotionId(bad), String(bad)).toBeNull()
    }
  })
})

describe("readNotionConfig", () => {
  it("is missing without a token; the id defaults to CHLK's Product Roadmap database", () => {
    expect(readNotionConfig({})).toEqual({ kind: "missing" })
    expect(readNotionConfig({ NOTION_READONLY_TOKEN: TOKEN })).toEqual({
      kind: "ok", token: TOKEN, id: DEFAULT_ROADMAP_DATABASE_ID, base: NOTION_API,
    })
    expect(readNotionConfig({ NOTION_READONLY_TOKEN: TOKEN, NOTION_ROADMAP_PAGE_ID: " " }).kind).toBe("ok")
    expect(readNotionConfig({ NOTION_ROADMAP_PAGE_ID: PAGE_HEX })).toEqual({ kind: "missing" })
    expect(readNotionConfig({ NOTION_READONLY_TOKEN: " ", NOTION_ROADMAP_PAGE_ID: PAGE_HEX })).toEqual({ kind: "missing" })
    expect(readNotionConfig(ENV)).toEqual({ kind: "ok", token: TOKEN, id: PAGE_ID, base: NOTION_API })
  })

  it("is invalid for a token not shaped like Notion's — the CI dummy included — or a bad id", () => {
    for (const token of ["ntn_CI-DUMMY-not-a-real-token-4b8e1d", "sk_live_abc", "ntn_short", `Bearer ${TOKEN}`]) {
      expect(readNotionConfig({ ...ENV, NOTION_READONLY_TOKEN: token })).toEqual({ kind: "invalid" })
    }
    expect(readNotionConfig({ ...ENV, NOTION_READONLY_TOKEN: "secret_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF" }).kind).toBe("ok")
    expect(readNotionConfig({ ...ENV, NOTION_ROADMAP_PAGE_ID: "not-an-id" })).toEqual({ kind: "invalid" })
  })

  it("CI's dummy token (the one check:bundle scans for) is one the server refuses", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8")
    const dummies = [...ci.matchAll(/NOTION_READONLY_TOKEN: (\S+)/g)].map((m) => m[1])
    expect(dummies.length).toBeGreaterThanOrEqual(2)
    for (const token of dummies) {
      expect(readNotionConfig({ NOTION_READONLY_TOKEN: token, NOTION_ROADMAP_PAGE_ID: PAGE_HEX })).toEqual({ kind: "invalid" })
    }
  })

  it("only takes a loopback mock base, and only outside production unless allowed", () => {
    expect(readNotionConfig({ ...ENV, NOTION_API_BASE: "http://127.0.0.1:9999/x" })).toMatchObject({ kind: "ok", base: "http://127.0.0.1:9999" })
    expect(readNotionConfig({ ...ENV, NOTION_API_BASE: "https://evil.example" })).toEqual({ kind: "invalid" })
    expect(readNotionConfig({ ...ENV, NOTION_API_BASE: "file:///etc/passwd" })).toEqual({ kind: "invalid" })
    const prod = { ...ENV, NODE_ENV: "production", NOTION_API_BASE: "http://localhost:9999" }
    expect(readNotionConfig(prod)).toEqual({ kind: "invalid" })
    expect(readNotionConfig({ ...prod, NOTION_ALLOW_MOCK_BASE: "1" })).toMatchObject({ kind: "ok", base: "http://localhost:9999" })
  })
})

/* ------------------------------------------------------ never waits, cache */

describe("never waits for a sync", () => {
  it("cold start: answers connecting at once while a 200 s sync runs (never not_connected), then connected once it lands", async () => {
    const load = vi.fn<Loader>(() => new Promise((r) => setTimeout(() => r(LIVE_ROADMAP), 200_000)))
    const { svc } = service(load)

    const started = wallClock()
    expect(await svc.roadmap()).toEqual(NOTION_CONNECTING)
    expect(await svc.health()).toBe("connecting")
    expect(wallClock() - started).toBeLessThan(1_000)
    expect(load).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(200_000)
    expect(await svc.roadmap()).toEqual({ status: "connected", lastSyncedAt: NOW.toISOString(), roadmap: LIVE_ROADMAP })
    expect(await svc.health()).toBe("ok")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a due refresh serves the last good copy at once (still connected) and refreshes behind it", async () => {
    let release!: (r: LiveRoadmap) => void
    const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
    const { svc } = service(load)
    const good = await synced(svc)

    load.mockImplementation(() => new Promise((r) => (release = r)))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect(await svc.roadmap()).toEqual(good)
    expect(load).toHaveBeenCalledTimes(2)

    const next = { items: LIVE_ROADMAP.items.slice(0, 1), unplaced: 2 }
    release(next)
    await svc.settled()
    expect(await svc.roadmap()).toEqual({
      status: "connected",
      lastSyncedAt: new Date(NOW.getTime() + CACHE_TTL_MS).toISOString(),
      roadmap: next,
    })
  })

  it("a sync over the time limit is a failure: logged, retried a minute later, the last good copy kept as stale", async () => {
    const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
    const { svc, log } = service(load)
    const good = await synced(svc)

    let aborted: AbortSignal | undefined
    load.mockImplementation((_c, signal) => {
      aborted = signal
      return new Promise(() => {})
    })
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect((await svc.roadmap()).status).toBe("connected")

    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeoutError")
    expect(aborted?.aborted).toBe(true)
    expect(await svc.roadmap()).toEqual({ ...good, status: "stale" })
    expect(await svc.health()).toBe("unavailable")

    load.mockImplementation(async () => LIVE_ROADMAP)
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await svc.roadmap()
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect((await synced(svc)).status).toBe("connected")
    expect(load).toHaveBeenCalledTimes(3)
  })

  it("the time limit sits under the routes' maxDuration (300 s)", () => {
    expect(SYNC_TIMEOUT_MS).toBeLessThan(300_000)
  })

  it("a cold-start sync that times out leaves not_connected (connecting until then)", async () => {
    const { svc, log } = service(() => new Promise(() => {}))
    expect(await svc.roadmap()).toEqual(NOTION_CONNECTING)
    await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS)
    expect(log).toHaveBeenCalledWith("SyncTimeoutError")
    expect(await svc.roadmap()).toEqual(NOTION_NOT_CONNECTED)
  })
})

describe("cache", () => {
  it("serves one sync for 5 minutes, then reads Notion again", async () => {
    const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
    const { svc } = service(load)
    await synced(svc)
    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    await svc.roadmap()
    await svc.health()
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await synced(svc)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("concurrent requests share one background sync (single flight)", async () => {
    let release!: (r: LiveRoadmap) => void
    const load = vi.fn<Loader>(() => new Promise((r) => (release = r)))
    const { svc } = service(load)
    await Promise.all([svc.roadmap(), svc.roadmap(), svc.health(), svc.roadmap()])
    expect(load).toHaveBeenCalledTimes(1)
    release(LIVE_ROADMAP)
    await svc.settled()
    expect((await svc.roadmap()).status).toBe("connected")
  })

  it("a sync started before reset() cannot write after it", async () => {
    let release!: (r: LiveRoadmap) => void
    const { svc } = service(() => new Promise((r) => (release = r)))
    await svc.roadmap()
    svc.reset()
    release(LIVE_ROADMAP)
    await Promise.resolve()
    // Nothing written: a fresh first sync, so connecting again, never the old rows.
    expect(await svc.roadmap()).toEqual(NOTION_CONNECTING)
  })
})

describe("fallback", () => {
  it("a 401 on the first sync → not_connected; the retry a minute later is never connecting", async () => {
    const load = vi.fn<Loader>(async () => {
      throw new NotionUnauthorizedError(401)
    })
    const { svc } = service(load)
    expect(await svc.roadmap()).toEqual(NOTION_CONNECTING)
    await svc.settled()
    expect(await svc.roadmap()).toEqual(NOTION_NOT_CONNECTED)
    expect(await svc.health()).toBe("unavailable")
    vi.advanceTimersByTime(RETRY_AFTER_MS)
    expect(await svc.roadmap()).toEqual(NOTION_NOT_CONNECTED)
    expect(load).toHaveBeenCalledTimes(2)
    await svc.settled()
    expect(await svc.roadmap()).toEqual(NOTION_NOT_CONNECTED)
  })

  it("never synced and Notion fails → not_connected, logged by class name only", async () => {
    const { svc, log } = service(async () => {
      throw new NotionUnauthorizedError(401)
    })
    expect(await synced(svc)).toEqual(NOTION_NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("NotionUnauthorizedError")
    expect(await svc.health()).toBe("unavailable")
  })

  it("a failure after a good sync → stale, with the last good rows and their time", async () => {
    const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
    const { svc } = service(load)
    const good = await synced(svc)
    load.mockRejectedValue(new TypeError("fetch failed"))
    vi.advanceTimersByTime(CACHE_TTL_MS)
    expect(await synced(svc)).toEqual({ ...good, status: "stale" })
  })

  it("missing or invalid token / id → not_connected / not_configured, and Notion is never called", async () => {
    for (const env of [
      {},
      { NOTION_ROADMAP_PAGE_ID: PAGE_HEX },
      { ...ENV, NOTION_READONLY_TOKEN: "ntn_CI-DUMMY-not-a-real-token-4b8e1d" },
      { ...ENV, NOTION_ROADMAP_PAGE_ID: "https://example.com/x" },
    ]) {
      const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
      const { svc } = service(load, env)
      expect(await synced(svc)).toEqual(NOTION_NOT_CONNECTED)
      expect(await svc.health()).toBe("not_configured")
      expect(load).not.toHaveBeenCalled()
    }
  })

  it("the token removed after a good sync → stale with the last rows", async () => {
    const env: Record<string, string | undefined> = { ...ENV }
    const load = vi.fn<Loader>(async () => LIVE_ROADMAP)
    const svc = createNotionService({ env: () => env, load, log: () => {} })
    await synced(svc)
    delete env.NOTION_READONLY_TOKEN
    expect(await svc.roadmap()).toMatchObject({ status: "stale", roadmap: LIVE_ROADMAP })
    expect(await svc.health()).toBe("not_configured")
  })

  it("failureKind names error classes only, never a message", () => {
    expect(failureKind(new NotionNotFoundError(404))).toBe("NotionNotFoundError")
    expect(failureKind(new SyncTimeoutError())).toBe("SyncTimeoutError")
    expect(failureKind(new TypeError(`fetch failed ${TOKEN}`))).toBe("TypeError")
    expect(failureKind(new Error(TOKEN))).toBe("UnknownError")
    expect(failureKind({ name: TOKEN })).toBe("UnknownError")
    expect(failureKind(null)).toBe("UnknownError")
    expect(failureKind("boom")).toBe("UnknownError")
  })

  it("logs never contain the token, even when an error quotes it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const svc = createNotionService({
      env: () => ENV,
      load: async () => {
        throw Object.assign(new Error(`401 for ${TOKEN}`), { token: TOKEN })
      },
    })
    await synced(svc)
    expect(warn).toHaveBeenCalledWith("[notion] sync failed: UnknownError")
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PAGE_HEX)
    warn.mockRestore()
  })
})

/* -------------------------------------------- resolving the roadmap's id */

/** A fake API by path: a value, or a status to fail with. */
function fakeApi(routes: Record<string, unknown>) {
  const calls: Array<{ path: string; body?: unknown }> = []
  const config: Ok = { kind: "ok", token: TOKEN, id: PAGE_ID, base: "http://127.0.0.1:1" }
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(`${config.base}/v1`, "")
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const key = Object.keys(routes).find((k) => path === k || path.startsWith(`${k}?`))
    const answer = key === undefined ? 404 : routes[key]
    if (typeof answer === "number") return new Response(JSON.stringify({ object: "error", status: answer, message: `secret ${TOKEN}` }), { status: answer })
    return Response.json(answer)
  })
  const request: NotionRequest = notionRequest(config, undefined, fetcher as unknown as typeof fetch)
  return { request, calls, fetcher }
}

const DB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const DB2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const DS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const DS2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const database = (id: string, ...sources: string[]) => ({ object: "database", id, data_sources: sources.map((s) => ({ id: s, name: "Roadmap" })) })
const blocks = (results: unknown[], more?: string) => ({ object: "list", results, has_more: Boolean(more), next_cursor: more ?? null })
const childDb = (id: string, title: string) => ({ object: "block", id, type: "child_database", has_children: false, child_database: { title } })

describe("resolveDataSources", () => {
  it("a database id → its data sources, in one call", async () => {
    const { request, calls } = fakeApi({ [`/databases/${PAGE_ID}`]: database(PAGE_ID, DS, DS2) })
    expect(await resolveDataSources(request, PAGE_ID)).toEqual([DS, DS2])
    expect(calls.map((c) => c.path)).toEqual([`/databases/${PAGE_ID}`])
  })

  it("a data source id → itself", async () => {
    const { request } = fakeApi({ [`/data_sources/${PAGE_ID}`]: { object: "data_source", id: PAGE_ID } })
    expect(await resolveDataSources(request, PAGE_ID)).toEqual([PAGE_ID])
  })

  it("a page id → the database on it, through paginated blocks and a column", async () => {
    const column = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    const { request, calls } = fakeApi({
      [`/databases/${PAGE_ID}`]: 400,
      [`/data_sources/${PAGE_ID}`]: 404,
      [`/pages/${PAGE_ID}`]: { object: "page", id: PAGE_ID },
      [`/blocks/${PAGE_ID}/children?page_size=100&start_cursor=c2`]: blocks([{ object: "block", id: column, type: "column_list", has_children: true }]),
      [`/blocks/${PAGE_ID}/children`]: blocks([{ object: "block", id: "p1", type: "paragraph", has_children: false }], "c2"),
      [`/blocks/${column}/children`]: blocks([childDb(DB, "Product roadmap")]),
      [`/databases/${DB}`]: database(DB, DS),
    })
    expect(await resolveDataSources(request, PAGE_ID)).toEqual([DS])
    expect(calls.every((c) => c.body === undefined)).toBe(true)
  })

  it("several databases on the page: the Roadmap-titled ones, else the first; linked ones the API cannot open are skipped", async () => {
    const page = {
      [`/pages/${PAGE_ID}`]: { object: "page" },
      [`/databases/${DB}`]: database(DB, DS),
      [`/databases/${DB2}`]: database(DB2, DS2),
    }
    const titled = fakeApi({ ...page, [`/blocks/${PAGE_ID}/children`]: blocks([childDb(DB, "Meeting notes"), childDb(DB2, "Roadmap")]) })
    expect(await resolveDataSources(titled.request, PAGE_ID)).toEqual([DS2])
    const untitled = fakeApi({ ...page, [`/blocks/${PAGE_ID}/children`]: blocks([childDb(DB, "Bets"), childDb(DB2, "Notes")]) })
    expect(await resolveDataSources(untitled.request, PAGE_ID)).toEqual([DS])
    const linked = fakeApi({
      [`/pages/${PAGE_ID}`]: { object: "page" },
      [`/blocks/${PAGE_ID}/children`]: blocks([childDb(DB, "Roadmap"), childDb(DB2, "Roadmap (linked)")]),
      [`/databases/${DB}`]: 404,
      [`/databases/${DB2}`]: database(DB2, DS2),
    })
    expect(await resolveDataSources(linked.request, PAGE_ID)).toEqual([DS2])
  })

  it("a page with no database → NoRoadmapDatabaseError; an id nothing knows → NotionNotFoundError", async () => {
    const empty = fakeApi({ [`/pages/${PAGE_ID}`]: { object: "page" }, [`/blocks/${PAGE_ID}/children`]: blocks([]) })
    await expect(resolveDataSources(empty.request, PAGE_ID)).rejects.toBeInstanceOf(NoRoadmapDatabaseError)
    const none = fakeApi({})
    await expect(resolveDataSources(none.request, PAGE_ID)).rejects.toBeInstanceOf(NotionNotFoundError)
  })

  it("a bad token fails at once (401 is not 'not this kind'), and the error carries no message text", async () => {
    const { request, calls } = fakeApi({ [`/databases/${PAGE_ID}`]: 401 })
    const error = await resolveDataSources(request, PAGE_ID).catch((e: Error) => e)
    expect(error).toBeInstanceOf(NotionUnauthorizedError)
    expect((error as Error).message).not.toContain(TOKEN)
    expect(calls).toHaveLength(1)
  })
})

/* ------------------------------------------------- fetch → loopback mock */

describe("loadFromNotion (fetch → loopback mock, never real Notion)", () => {
  const seen: Array<{ method: string; url: string; auth?: string; version?: string; body: string }> = []
  let server: http.Server
  let port = 0
  let rowsPerPage = 2
  let totalRows = 5

  const rows = () =>
    Array.from({ length: totalRows }, (_, i) =>
      notionRow({ title: `Bet ${i + 1}`, status: ["Now", "Next", "Later", "Done", "Blocked"][i % 5], owners: ["Rashad"] })
    )

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, version: req.headers["notion-version"] as string, body })
        res.setHeader("Content-Type", "application/json")
        const url = new URL(req.url!, "http://localhost")
        if (url.pathname === `/v1/databases/${PAGE_ID}`) {
          res.statusCode = 400
          res.end(JSON.stringify({ object: "error", code: "validation_error", message: "is a page, not a database" }))
        } else if (url.pathname === `/v1/data_sources/${PAGE_ID}`) {
          res.statusCode = 404
          res.end(JSON.stringify({ object: "error", code: "object_not_found" }))
        } else if (url.pathname === `/v1/pages/${PAGE_ID}`) {
          res.end(JSON.stringify({ object: "page", id: PAGE_ID }))
        } else if (url.pathname === `/v1/blocks/${PAGE_ID}/children`) {
          res.end(JSON.stringify(blocks([childDb(DB, "Roadmap")])))
        } else if (url.pathname === `/v1/databases/${DB}`) {
          res.end(JSON.stringify(database(DB, DS)))
        } else if (url.pathname === `/v1/data_sources/${DS}/query` && req.method === "POST") {
          const { start_cursor } = JSON.parse(body || "{}") as { start_cursor?: string }
          const from = start_cursor ? Number(start_cursor) : 0
          const all = rows()
          const to = Math.min(from + rowsPerPage, all.length)
          res.end(JSON.stringify({ object: "list", results: all.slice(from, to), has_more: to < all.length, next_cursor: to < all.length ? String(to) : null }))
        } else {
          res.statusCode = 404
          res.end("{}")
        }
      })
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))
  beforeEach(() => {
    vi.useRealTimers()
    seen.length = 0
    rowsPerPage = 2
    totalRows = 5
  })

  const config = () => {
    const c = readNotionConfig({ ...ENV, NOTION_API_BASE: `http://127.0.0.1:${port}` })
    expect(c.kind).toBe("ok")
    return c as Ok
  }

  it("page → its database → every page of rows; GET reads and POST queries only, token as Bearer, version pinned", async () => {
    const roadmap = await loadFromNotion(config())
    expect(roadmap.items.map((i) => [i.title, i.column])).toEqual([["Bet 1", "now"], ["Bet 2", "next"], ["Bet 3", "later"]])
    expect(roadmap.unplaced).toBe(1)

    expect(seen.every((r) => r.auth === `Bearer ${TOKEN}` && r.version === NOTION_VERSION)).toBe(true)
    const posts = seen.filter((r) => r.method === "POST")
    expect(posts.every((r) => r.url === `/v1/data_sources/${DS}/query`)).toBe(true)
    expect(posts.map((r) => JSON.parse(r.body))).toEqual([{ page_size: 100 }, { page_size: 100, start_cursor: "2" }, { page_size: 100, start_cursor: "4" }])
    expect(seen.filter((r) => r.method !== "POST").every((r) => r.method === "GET")).toBe(true)
  })

  it(`more than ${MAX_ROWS} rows is TooManyRowsError, not a silently cut roadmap`, async () => {
    rowsPerPage = 100
    totalRows = MAX_ROWS + 1
    await expect(loadFromNotion(config())).rejects.toBeInstanceOf(TooManyRowsError)
    expect(seen.filter((r) => r.method === "POST")).toHaveLength(11)
  })

  it("an aborted sync stops its call", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadFromNotion(config(), controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  })
})
