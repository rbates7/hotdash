// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NOT_CONNECTED } from "@/lib/stripe-summary"

// The routes' one dependency, mocked: these tests never reach Stripe, even
// on a machine that has a key in its environment.
const service = vi.hoisted(() => ({ summary: vi.fn(), health: vi.fn() }))
vi.mock("@/lib/server/stripe", () => ({ stripeService: service }))

const { GET: summary } = await import("@/app/api/stripe/summary/route")
const { GET: health } = await import("@/app/api/health/stripe/route")

beforeEach(() => {
  service.summary.mockReset()
  service.health.mockReset()
})

describe("GET /api/stripe/summary", () => {
  it("passes a known zone through, and falls back to Central for anything else", async () => {
    service.summary.mockResolvedValue(NOT_CONNECTED)
    await summary(new NextRequest("http://localhost/api/stripe/summary?tz=America/Denver"))
    await summary(new NextRequest("http://localhost/api/stripe/summary?tz=Mars/Olympus"))
    await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(service.summary.mock.calls).toEqual([["America/Denver"], ["America/Chicago"], ["America/Chicago"]])
  })

  it("is never cached by a browser or CDN", async () => {
    service.summary.mockResolvedValue(NOT_CONNECTED)
    const res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(NOT_CONNECTED)
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.summary.mockRejectedValue(new Error("secret detail rk_live_xyz"))
    const res = await summary(new NextRequest("http://localhost/api/stripe/summary"))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(NOT_CONNECTED)
    expect(text).not.toContain("secret")
  })
})

describe("GET /api/health/stripe", () => {
  it.each(["ok", "unavailable", "not_configured"] as const)("returns only {stripe: %s}", async (status) => {
    service.health.mockResolvedValue(status)
    const res = await health()
    expect(await res.json()).toEqual({ stripe: status })
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("an unexpected throw is unavailable, with no error text", async () => {
    service.health.mockRejectedValue(new Error("secret detail"))
    const res = await health()
    expect(await res.text()).toBe(JSON.stringify({ stripe: "unavailable" }))
  })
})
