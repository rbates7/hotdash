// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GmailThreadMeta } from "@/lib/crm/gmail-mapping"
import { CACHE_TTL_MS, createGmailService, gmailThreadLoader, GMAIL_API, TOKEN_URL } from "@/lib/server/gmail"

/** Fake credentials: shaped like Google's, valid nowhere. */
const SECRET = "crm-unit-test-only-secret"
const REFRESH = "crm-unit-test-only-refresh"
const CLIENT_ID = "crm-unit-test-only.apps.googleusercontent.com"
const ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: SECRET, GMAIL_REFRESH_TOKEN: REFRESH, GMAIL_MAILBOX: "support@example.com" }
const ME = "support@example.com"
const NOW = Date.parse("2026-10-20T12:00:00.000Z")
const H = 3_600_000

const THREADS: GmailThreadMeta[] = [
  {
    id: "abc1",
    messages: [
      { id: "1", labelIds: ["INBOX"], internalDate: String(NOW - 3 * H), snippet: "help", headers: { from: "Ana <ana@school.example.com>", to: ME, subject: "Help" } },
      { id: "2", labelIds: ["SENT"], internalDate: String(NOW - 2 * H), snippet: "on it", headers: { from: ME, to: "ana@school.example.com", subject: "Re: Help" } },
      { id: "3", labelIds: ["INBOX", "UNREAD"], internalDate: String(NOW - 1 * H), snippet: "thanks", headers: { from: "Ana <ana@school.example.com>", to: ME, subject: "Re: Help" } },
    ],
  },
]

const FULL = {
  id: "abc1",
  messages: [
    {
      labelIds: ["INBOX"],
      internalDate: String(NOW - 3 * H),
      payload: { mimeType: "text/plain", headers: [{ name: "From", value: "Ana <ana@school.example.com>" }], body: { data: Buffer.from("Full body").toString("base64url") } },
    },
  ],
}

beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

async function ready(loadThread = vi.fn(async () => FULL as unknown)) {
  const load = vi.fn(async () => THREADS)
  const log = vi.fn()
  const svc = createGmailService({ env: () => ENV, load, loadThread, log })
  await svc.list()
  await svc.settled()
  return { svc, load, loadThread, log }
}

describe("gmailService.list", () => {
  it("is not_connected with the empty contract and no Gmail call when unconfigured", async () => {
    const load = vi.fn()
    const svc = createGmailService({ env: () => ({}), load, log: () => {} })
    const body = await svc.list()
    expect(body).toMatchObject({ status: "not_connected", lastUpdated: null, cases: [], accounts: [], recentActivity: [] })
    expect(body.counts).toEqual({ open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 })
    expect(load).not.toHaveBeenCalled()
  })

  it("is connecting during the first sync, then connected with cases", async () => {
    const svc = createGmailService({ env: () => ENV, load: async () => THREADS, loadThread: vi.fn(), log: () => {} })
    expect((await svc.list()).status).toBe("connecting")
    await svc.settled()
    const body = await svc.list()
    expect(body.status).toBe("connected")
    expect(body.lastUpdated).toBe(new Date(NOW).toISOString())
    expect(body.cases).toHaveLength(1)
    expect(body.cases[0]).toMatchObject({ id: "case-1", status: "waiting_on_us", unread: true, messageCount: 3 })
    expect(body.counts.waitingOnUs).toBe(1)
    expect(body.accounts[0]).toMatchObject({ domain: "school.example.com", openCases: 1 })
  })

  it("serves the last good copy for 5 minutes, then stale after a failed re-read", async () => {
    const { svc, load } = await ready()
    vi.setSystemTime(NOW + CACHE_TTL_MS - 1)
    await svc.list()
    expect(load).toHaveBeenCalledTimes(1)
    load.mockRejectedValueOnce(new Error(SECRET))
    vi.setSystemTime(NOW + CACHE_TTL_MS)
    await svc.list()
    await svc.settled()
    const body = await svc.list()
    expect(load).toHaveBeenCalledTimes(2)
    expect(body.status).toBe("stale")
    expect(body.cases).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })
})

describe("gmailService.thread", () => {
  it("fetches the case's Gmail thread with bodies, and caches it for 5 minutes", async () => {
    const { svc, loadThread } = await ready()
    const body = await svc.thread("case-1")
    expect(loadThread).toHaveBeenCalledWith(expect.objectContaining({ mailbox: ME }), "abc1", expect.anything())
    expect(body).toMatchObject({ status: "connected", caseId: "case-1" })
    expect(body!.messages[0]).toMatchObject({ id: "thread-1-m1", bodyText: "Full body", direction: "inbound" })
    await svc.thread("case-1")
    expect(loadThread).toHaveBeenCalledTimes(1)
    vi.setSystemTime(NOW + CACHE_TTL_MS)
    await svc.thread("case-1")
    expect(loadThread).toHaveBeenCalledTimes(2)
  })

  it("is null for an unknown case, without asking Gmail", async () => {
    const { svc, loadThread } = await ready()
    expect(await svc.thread("case-42")).toBeNull()
    expect(loadThread).not.toHaveBeenCalled()
  })

  it("falls back to snippets as stale when Gmail fails, and logs no secret", async () => {
    const { svc, log } = await ready(vi.fn(async () => {
      throw new Error(SECRET)
    }))
    const body = await svc.thread("case-1")
    expect(body!.status).toBe("stale")
    expect(body!.messages.map((m) => m.bodyText)).toEqual(["help", "on it", "thanks"])
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET)
    expect(JSON.stringify(body)).not.toContain(SECRET)
  })

  it("is not_connected and empty before any sync", async () => {
    const svc = createGmailService({ env: () => ({}), load: vi.fn(), loadThread: vi.fn(), log: () => {} })
    expect(await svc.thread("case-1")).toEqual({ status: "not_connected", lastUpdated: null, caseId: "case-1", messages: [] })
  })
})

describe("gmailThreadLoader", () => {
  it("asks for one thread in full with a bearer token, and refuses a non-Gmail id", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === TOKEN_URL) return Response.json({ access_token: "ya29.unit-test", expires_in: 3600 })
      return Response.json(FULL)
    }) as unknown as typeof fetch
    const load = gmailThreadLoader(fetchImpl)
    const config = { kind: "ok" as const, clientId: CLIENT_ID, clientSecret: SECRET, refreshToken: REFRESH, mailbox: ME }
    expect(await load(config, "abc1")).toEqual(FULL)
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(String(calls[1]![0])).toBe(`${GMAIL_API}/${encodeURIComponent(ME)}/threads/abc1?format=full`)
    await expect(load(config, "../x")).rejects.toThrow()
  })
})

describe("case numbers", () => {
  it("are the same as the legacy summary's, and a skipped thread takes no number", async () => {
    const bounce: GmailThreadMeta = {
      id: "abc0",
      messages: [{ id: "9", labelIds: ["INBOX"], internalDate: String(NOW - 9 * H), snippet: "x", headers: { from: "mailer-daemon@example.com", to: ME, subject: "Undeliverable" } }],
    }
    const later: GmailThreadMeta = {
      id: "abc2",
      messages: [
        { id: "20", labelIds: ["INBOX"], internalDate: String(NOW - 2 * H), snippet: "hi", headers: { from: "Bo <bo@school.example.com>", to: ME, subject: "Q" } },
        { id: "21", labelIds: ["SENT"], internalDate: String(NOW - 1 * H), snippet: "ok", headers: { from: ME, to: "bo@school.example.com", subject: "Re: Q" } },
      ],
    }
    let threads = [bounce, ...THREADS]
    const svc = createGmailService({ env: () => ENV, load: async () => threads, loadThread: vi.fn(), log: () => {} })
    await svc.list()
    await svc.settled()
    threads = [bounce, ...THREADS, later]
    vi.setSystemTime(NOW + CACHE_TTL_MS)
    await svc.list()
    await svc.settled()
    const body = await svc.list()
    const legacy = body.data!.cases.map((c) => c.id).sort()
    expect(body.cases.map((c) => c.id).sort()).toEqual(legacy)
    expect(legacy).toEqual(["case-1", "case-2"])
  })
})
