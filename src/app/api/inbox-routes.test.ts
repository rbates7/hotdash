// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { liveInbox } from "@/test/inbox-fixture"

// The route's dependency, mocked: these tests never reach GitHub or Sentry,
// even on a machine that has tokens in its environment.
const server = vi.hoisted(() => ({ readInbox: vi.fn(), inboxSettled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/inbox", () => server)
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const route = await import("@/app/api/inbox/route")

const SECRET = "sntrys_route-test-secret-value-0123456789abcdef"

beforeEach(() => {
  server.readInbox.mockReset()
  server.inboxSettled.mockClear()
  after.mockReset()
})

describe("GET /api/inbox", () => {
  it("is rendered per request, never at build, with room for a slow sync", () => {
    expect(route.dynamic).toBe("force-dynamic")
    expect(route.maxDuration).toBe(300)
  })

  it("answers without waiting for a sync, and keeps the background syncs alive after the response", async () => {
    server.readInbox.mockResolvedValue(liveInbox(Date.now()))
    await route.GET()
    expect(after).toHaveBeenCalledTimes(1)
    expect(server.inboxSettled).not.toHaveBeenCalled()
    await after.mock.calls[0]![0]()
    expect(server.inboxSettled).toHaveBeenCalledTimes(1)
  })

  it("is never cached by a browser or CDN, and passes the inbox through", async () => {
    const inbox = liveInbox(Date.parse("2026-10-18T20:00:00.000Z"))
    server.readInbox.mockResolvedValue(inbox)
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(inbox)
  })

  it("an unexpected throw is every source not_connected with no rows, never the error", async () => {
    server.readInbox.mockRejectedValue(new Error(`boom ${SECRET}`))
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    const text = await res.text()
    const body = JSON.parse(text)
    expect(Number.isFinite(Date.parse(body.fetchedAt))).toBe(true)
    expect(body.items).toEqual([])
    expect(body.sources).toEqual({
      github: { status: "not_connected", fetchedAt: null },
      sentry: { status: "not_connected", fetchedAt: null },
      gmail: { status: "not_connected", fetchedAt: null },
    })
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain("boom")
  })
})
