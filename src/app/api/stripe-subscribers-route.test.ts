// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GATE_COOKIE, signGateCookie } from "@/lib/gate/cookie"

const lists = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock("@/lib/server/stripe-subscribers", () => ({ subscriberLists: lists }))
const service = vi.hoisted(() => ({ settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/stripe", () => ({ stripeService: service }))
const after = vi.hoisted(() => vi.fn())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET } = await import("@/app/api/stripe/subscribers/route")
const { proxy } = await import("@/proxy")

const url = (q: string) => new NextRequest(`http://localhost/api/stripe/subscribers${q}`)

beforeEach(() => {
  lists.read.mockReset()
  after.mockReset()
})

describe("GET /api/stripe/subscribers", () => {
  it("401s through the proxy when logged out, and passes with a valid cookie", async () => {
    vi.stubEnv("DASHBOARD_LOGIN_EMAIL", "founder@example.test")
    vi.stubEnv("DASHBOARD_GATE_SECRET", "test-only-gate-password-1")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const out = await proxy(url("?list=new"))
    expect(out.status).toBe(401)
    const cookie = await signGateCookie("founder@example.test", "test-only-gate-password-1")
    const ok = await proxy(new NextRequest("http://localhost/api/stripe/subscribers?list=new", { headers: { cookie: `${GATE_COOKIE}=${cookie}` } }))
    expect(ok.headers.get("x-middleware-next")).toBe("1")
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each(["", "?list=", "?list=all", "?list=NEW", "?list=churned%20"])("400s a bad list (%s) without reading Stripe", async (q) => {
    const res = await GET(url(q))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "bad_list" })
    expect(lists.read).not.toHaveBeenCalled()
  })

  it("passes the list and a known zone; anything else is Central", async () => {
    lists.read.mockResolvedValue({ status: "not_connected", lastSyncedAt: null, list: "new", window: null, total: 0, rows: [] })
    await GET(url("?list=new&tz=America/Denver"))
    await GET(url("?list=churned&tz=Mars/Olympus"))
    expect(lists.read.mock.calls).toEqual([["new", "America/Denver"], ["churned", "America/Chicago"]])
  })

  it("is never cached by a browser, and keeps the sync alive after the response", async () => {
    lists.read.mockResolvedValue({ status: "not_connected", lastSyncedAt: null, list: "new", window: null, total: 0, rows: [] })
    const res = await GET(url("?list=new"))
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(after).toHaveBeenCalledTimes(1)
  })

  it("an unexpected throw is an empty not_connected list, never the error", async () => {
    lists.read.mockRejectedValue(new Error("rk_live_secret coach@example.test"))
    const res = await GET(url("?list=churned"))
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ status: "not_connected", lastSyncedAt: null, list: "churned", window: null, total: 0, rows: [] })
    expect(text).not.toMatch(/secret|@/)
  })
})
