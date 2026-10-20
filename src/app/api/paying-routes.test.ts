// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocked: never reaches a database, even with a URL in the environment.
const source = vi.hoisted(() => ({ read: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/paying-coaches", () => ({ payingSource: () => source }))
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET } = await import("@/app/api/subscriptions/paying/route")

beforeEach(() => {
  source.read.mockReset()
  after.mockReset()
})

describe("GET /api/subscriptions/paying", () => {
  it("returns the reading, uncached, and settles the read after the response", async () => {
    const body = { status: "connected", counts: { appStore: 1, stripe: 2, invoice: 3, other: 0, total: 6 }, asOf: "2026-10-19T20:00:00.000Z" }
    source.read.mockResolvedValue(body)
    const res = await GET()
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual(body)
    expect(after).toHaveBeenCalledTimes(1)
  })
  it("is not connected if the source throws, never an error body", async () => {
    source.read.mockRejectedValue(new Error("boom postgres://x"))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "not_connected" })
  })
})
