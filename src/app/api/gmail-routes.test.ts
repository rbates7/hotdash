// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GMAIL_NOT_CONNECTED } from "@/lib/crm/gmail-summary"
import { liveGmailSummary } from "@/test/gmail-fixture"

// The routes' dependency, mocked: these tests never reach Gmail, even on a
// machine that has credentials in its environment.
const service = vi.hoisted(() => ({ summary: vi.fn(), health: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/gmail", () => ({ gmailService: service }))
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET: summary } = await import("@/app/api/crm/gmail/route")
const { GET: health } = await import("@/app/api/health/gmail/route")

const SECRET = "GOCSPX-route-test-secret"

beforeEach(() => {
  service.summary.mockReset()
  service.health.mockReset()
  service.settled.mockClear()
  after.mockReset()
})

describe("GET /api/crm/gmail", () => {
  it("answers without waiting for a sync, and keeps the background sync alive after the response", async () => {
    service.summary.mockResolvedValue(GMAIL_NOT_CONNECTED)
    await summary()
    expect(after).toHaveBeenCalledTimes(1)
    expect(service.settled).not.toHaveBeenCalled()
    await after.mock.calls[0]![0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("is never cached by a browser or CDN, and passes the service's answer through", async () => {
    const live = liveGmailSummary(Date.parse("2026-10-14T17:00:00.000Z"))
    service.summary.mockResolvedValue(live)
    const res = await summary()
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(live)
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.summary.mockRejectedValue(new Error(`invalid_grant ${SECRET}`))
    const res = await summary()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(GMAIL_NOT_CONNECTED)
    expect(text).not.toContain(SECRET)
  })
})

describe("GET /api/health/gmail", () => {
  it.each(["ok", "error", "not_configured"] as const)("returns only {gmail: %s}", async (status) => {
    service.health.mockResolvedValue(status)
    const res = await health()
    expect(await res.text()).toBe(JSON.stringify({ gmail: status }))
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("keeps a background sync alive after the response", async () => {
    service.health.mockResolvedValue("error")
    await health()
    await after.mock.calls[0]![0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("an unexpected throw is error, with no error text", async () => {
    service.health.mockRejectedValue(new Error(SECRET))
    const res = await health()
    expect(await res.text()).toBe(JSON.stringify({ gmail: "error" }))
  })
})

describe("the real service behind the routes, with no credentials", () => {
  it("says not_connected / not_configured and never names a secret", async () => {
    const { createGmailService } = await vi.importActual<typeof import("@/lib/server/gmail")>("@/lib/server/gmail")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const svc = createGmailService({ env: () => ({ GMAIL_MAILBOX: "info@chlkapp.com" }) })
    const body = JSON.stringify([await svc.summary(), await svc.health()])
    expect(JSON.parse(body)).toEqual([GMAIL_NOT_CONNECTED, "not_configured"])
    expect(body).not.toMatch(/GMAIL_|client_secret|refresh_token|access_token/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
