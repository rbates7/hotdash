// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { GMAIL_NOT_CONNECTED } from "@/lib/crm/gmail-summary"
import { emptyCrmList } from "@/lib/crm/gmail-view"
import { liveGmailSummary } from "@/test/gmail-fixture"

// The routes' dependency, mocked: these tests never reach Gmail, even on a
// machine that has credentials in its environment.
const service = vi.hoisted(() => ({ list: vi.fn(), thread: vi.fn(), health: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/gmail", () => ({ gmailService: service }))
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET: summary } = await import("@/app/api/crm/gmail/route")
const { GET: health } = await import("@/app/api/health/gmail/route")

const SECRET = "GOCSPX-route-test-secret"

beforeEach(() => {
  service.list.mockReset()
  service.thread.mockReset()
  service.health.mockReset()
  service.settled.mockClear()
  after.mockReset()
})

describe("GET /api/crm/gmail", () => {
  const url = (q = "") => new Request(`http://localhost/api/crm/gmail${q}`)

  it("answers without waiting for a sync, and keeps the background sync alive after the response", async () => {
    service.list.mockResolvedValue({ ...GMAIL_NOT_CONNECTED, lastUpdated: null, ...emptyCrmList() })
    await summary(url())
    expect(after).toHaveBeenCalledTimes(1)
    expect(service.settled).not.toHaveBeenCalled()
    await after.mock.calls[0]![0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("is never cached by a browser or CDN, and passes the service's list through", async () => {
    const live = { ...liveGmailSummary(Date.parse("2026-10-14T17:00:00.000Z")), lastUpdated: "2026-10-14T16:59:00.000Z", ...emptyCrmList() }
    service.list.mockResolvedValue(live)
    const res = await summary(url())
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(live)
  })

  it("an unexpected throw is not_connected with the empty contract, never the error", async () => {
    service.list.mockRejectedValue(new Error(`invalid_grant ${SECRET}`))
    const res = await summary(url())
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ...GMAIL_NOT_CONNECTED, lastUpdated: null, ...emptyCrmList() })
    expect(text).not.toContain(SECRET)
  })

  it("?caseId= returns that case's thread", async () => {
    const body = { status: "connected", lastUpdated: "2026-10-14T16:59:00.000Z", caseId: "case-3", messages: [] }
    service.thread.mockResolvedValue(body)
    const res = await summary(url("?caseId=case-3"))
    expect(service.thread).toHaveBeenCalledWith("case-3")
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(body)
  })

  it.each(["", "3", "case-x", "../case-1", "thread-1"])("?caseId=%s is 400 without asking Gmail", async (id) => {
    const res = await summary(url(`?caseId=${encodeURIComponent(id)}`))
    expect(res.status).toBe(400)
    expect(service.thread).not.toHaveBeenCalled()
  })

  it("an unknown case is 404", async () => {
    service.thread.mockResolvedValue(null)
    expect((await summary(url("?caseId=case-999"))).status).toBe(404)
  })

  it("a thread throw is not_connected with no messages and no error text", async () => {
    service.thread.mockRejectedValue(new Error(SECRET))
    const res = await summary(url("?caseId=case-1"))
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ status: "not_connected", lastUpdated: null, caseId: "case-1", messages: [] })
    expect(text).not.toContain(SECRET)
  })
})

describe("GET /api/health/gmail", () => {
  it.each(["ok", "connecting", "error", "not_configured"] as const)("returns only {gmail: %s}", async (status) => {
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
