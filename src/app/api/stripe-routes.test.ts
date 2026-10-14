// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { APP_STORE_NOT_CONNECTED } from "@/lib/app-store-summary"
import { NOT_CONNECTED } from "@/lib/stripe-summary"
import { APP_STORE_CONNECTED, liveSummary } from "@/test/stripe-fixture"

// The routes' dependencies, mocked: these tests never reach Stripe or a
// database, even on a machine that has a key or URL in its environment.
const service = vi.hoisted(() => ({ summary: vi.fn(), health: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/stripe", () => ({ stripeService: service }))
const appStore = vi.hoisted(() => ({ read: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/app-store", () => ({ appStoreSource: () => appStore }))
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET: summary } = await import("@/app/api/stripe/summary/route")
const { GET: health } = await import("@/app/api/health/stripe/route")

beforeEach(() => {
  service.summary.mockReset()
  service.health.mockReset()
  appStore.read.mockReset()
  appStore.read.mockResolvedValue(APP_STORE_NOT_CONNECTED)
  service.settled.mockClear()
  appStore.settled.mockClear()
  after.mockReset()
})

const NOT_CONNECTED_BODY = { ...NOT_CONNECTED, appStore: APP_STORE_NOT_CONNECTED }

describe("GET /api/stripe/summary", () => {
  it("passes a known zone through, and falls back to Central for anything else", async () => {
    service.summary.mockResolvedValue(NOT_CONNECTED)
    await summary(new NextRequest("http://localhost/api/stripe/summary?tz=America/Denver"))
    await summary(new NextRequest("http://localhost/api/stripe/summary?tz=Mars/Olympus"))
    await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(service.summary.mock.calls).toEqual([["America/Denver"], ["America/Chicago"], ["America/Chicago"]])
  })

  it("answers without waiting for a sync, and keeps both sources' background syncs alive after the response", async () => {
    service.summary.mockResolvedValue(NOT_CONNECTED)
    await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(after).toHaveBeenCalledTimes(1)
    expect(service.settled).not.toHaveBeenCalled()
    await after.mock.calls[0][0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
    expect(appStore.settled).toHaveBeenCalledTimes(1)
  })

  it("is never cached by a browser or CDN", async () => {
    service.summary.mockResolvedValue(NOT_CONNECTED)
    const res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(NOT_CONNECTED_BODY)
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.summary.mockRejectedValue(new Error("secret detail rk_live_xyz"))
    const res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(NOT_CONNECTED_BODY)
    expect(text).not.toContain("secret")
  })

  it("carries the App Store count in its own field, beside Stripe's figures", async () => {
    const { appStore: _drop, ...stripe } = liveSummary("connected")
    void _drop
    service.summary.mockResolvedValue(stripe)
    appStore.read.mockResolvedValue(APP_STORE_CONNECTED)
    const res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(await res.json()).toEqual({ ...stripe, appStore: APP_STORE_CONNECTED })
  })

  it("an App Store failure never touches the Stripe figures, and a Stripe failure never the App Store's", async () => {
    const { appStore: _drop, ...stripe } = liveSummary("connected")
    void _drop
    service.summary.mockResolvedValue(stripe)
    appStore.read.mockRejectedValue(new Error("postgresql://u:secret@h/db"))
    let res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    let text = await res.text()
    expect(JSON.parse(text)).toEqual({ ...stripe, appStore: APP_STORE_NOT_CONNECTED })
    expect(text).not.toContain("secret")

    service.summary.mockRejectedValue(new Error("boom"))
    appStore.read.mockResolvedValue(APP_STORE_CONNECTED)
    res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    text = await res.text()
    expect(JSON.parse(text)).toEqual({ ...NOT_CONNECTED, appStore: APP_STORE_CONNECTED })
  })
})

describe("GET /api/health/stripe", () => {
  it.each(["ok", "unavailable", "not_configured"] as const)("returns only {stripe: %s}", async (status) => {
    service.health.mockResolvedValue(status)
    const res = await health()
    expect(await res.json()).toEqual({ stripe: status })
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("keeps a background sync alive after the response", async () => {
    service.health.mockResolvedValue("unavailable")
    await health()
    await after.mock.calls[0][0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("an unexpected throw is unavailable, with no error text", async () => {
    service.health.mockRejectedValue(new Error("secret detail"))
    const res = await health()
    expect(await res.text()).toBe(JSON.stringify({ stripe: "unavailable" }))
  })
})
