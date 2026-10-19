// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { POSTHOG_NOT_CONNECTED } from "@/lib/posthog-summary"
import { livePosthogSummary } from "@/test/posthog-fixture"

// The routes' dependency, mocked: these tests never reach PostHog, even on
// a machine that has a key in its environment.
const service = vi.hoisted(() => ({ summary: vi.fn(), health: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/posthog", () => ({ posthogService: service }))
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET: summary } = await import("@/app/api/posthog/summary/route")
const { GET: health } = await import("@/app/api/health/posthog/route")

beforeEach(() => {
  service.summary.mockReset()
  service.health.mockReset()
  service.settled.mockClear()
  after.mockReset()
})

describe("GET /api/posthog/summary", () => {
  it("answers without waiting for a sync, and keeps the background sync alive after the response", async () => {
    service.summary.mockResolvedValue(POSTHOG_NOT_CONNECTED)
    await summary()
    expect(after).toHaveBeenCalledTimes(1)
    expect(service.settled).not.toHaveBeenCalled()
    await after.mock.calls[0][0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("returns the service's summary, never cached", async () => {
    service.summary.mockResolvedValue(livePosthogSummary("stale"))
    const res = await summary()
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(livePosthogSummary("stale"))
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.summary.mockRejectedValue(new Error("secret detail phx_abc123"))
    const res = await summary()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(POSTHOG_NOT_CONNECTED)
    expect(text).not.toContain("secret")
  })
})

describe("GET /api/health/posthog", () => {
  it("is exactly one word per state", async () => {
    for (const state of ["ok", "unavailable", "not_configured"] as const) {
      service.health.mockResolvedValue(state)
      const res = await health()
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(await res.text()).toBe(`{"posthog":"${state}"}`)
    }
  })

  it("a throw is unavailable, with no detail", async () => {
    service.health.mockRejectedValue(new Error("phx_leak"))
    const res = await health()
    expect(await res.text()).toBe('{"posthog":"unavailable"}')
  })

  it("keeps the background sync alive after the response", async () => {
    service.health.mockResolvedValue("ok")
    await health()
    expect(after).toHaveBeenCalledTimes(1)
  })
})
