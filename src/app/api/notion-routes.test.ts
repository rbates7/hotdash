// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NOTION_NOT_CONNECTED } from "@/lib/notion-roadmap"
import { liveRoadmapSummary } from "@/test/notion-fixture"

// The routes' dependency, mocked: these tests never reach Notion, even on
// a machine that has a token in its environment.
const service = vi.hoisted(() => ({ roadmap: vi.fn(), health: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/notion", () => ({ notionService: service }))
// `after` needs a live request scope; here it only records the callback.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const roadmapRoute = await import("@/app/api/notion/roadmap/route")
const healthRoute = await import("@/app/api/health/notion/route")

beforeEach(() => {
  service.roadmap.mockReset()
  service.health.mockReset()
  service.settled.mockClear()
  after.mockReset()
})

describe("GET /api/notion/roadmap", () => {
  it("answers from the cache without waiting, and keeps the background sync alive after the response", async () => {
    service.roadmap.mockResolvedValue(NOTION_NOT_CONNECTED)
    const res = await roadmapRoute.GET()
    expect(await res.json()).toEqual(NOTION_NOT_CONNECTED)
    expect(after).toHaveBeenCalledTimes(1)
    expect(service.settled).not.toHaveBeenCalled()
    await after.mock.calls[0][0]()
    expect(service.settled).toHaveBeenCalledTimes(1)
  })

  it("passes connected and stale through, never cached", async () => {
    for (const status of ["connected", "stale"] as const) {
      service.roadmap.mockResolvedValue(liveRoadmapSummary(status))
      const res = await roadmapRoute.GET()
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(await res.json()).toEqual(liveRoadmapSummary(status))
    }
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.roadmap.mockRejectedValue(new Error("ntn_secret in a message"))
    const res = await roadmapRoute.GET()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual(NOTION_NOT_CONNECTED)
    expect(text).not.toContain("ntn_")
  })

  it("runs per request with room for the background sync", () => {
    expect(roadmapRoute.dynamic).toBe("force-dynamic")
    expect(roadmapRoute.maxDuration).toBe(300)
  })
})

describe("GET /api/health/notion", () => {
  it("is one word and nothing else", async () => {
    for (const word of ["ok", "unavailable", "not_configured"] as const) {
      service.health.mockResolvedValue(word)
      const res = await healthRoute.GET()
      expect(await res.text()).toBe(JSON.stringify({ notion: word }))
      expect(res.headers.get("cache-control")).toBe("no-store")
    }
    expect(after).toHaveBeenCalledTimes(3)
  })

  it("a throw is unavailable", async () => {
    service.health.mockRejectedValue(new Error("boom"))
    expect(await (await healthRoute.GET()).json()).toEqual({ notion: "unavailable" })
  })

  it("runs per request with room for the background sync", () => {
    expect(healthRoute.dynamic).toBe("force-dynamic")
    expect(healthRoute.maxDuration).toBe(300)
  })
})
