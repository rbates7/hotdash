import { afterEach, describe, expect, it, vi } from "vitest"

type RunResult = { runId: string; status: string; message?: string }

const mocks = vi.hoisted(() => ({
  runSync: vi.fn(async (): Promise<RunResult> => ({
    runId: "run-1",
    status: "success",
  })),
}))

vi.mock("@/lib/crm/db/client", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/crm/sync/runner", () => ({ runSync: mocks.runSync }))

import { GET, POST } from "./route"

const context = (source: string) => ({ params: Promise.resolve({ source }) })

afterEach(() => {
  delete process.env.CRON_SECRET
  mocks.runSync.mockClear()
})

describe("CRM sync route", () => {
  it("fails closed when CRON_SECRET is not configured", async () => {
    const response = await GET(
      new Request("https://dashboard.example/api/crm/sync/gmail"),
      context("gmail")
    )
    expect(response.status).toBe(503)
    expect(mocks.runSync).not.toHaveBeenCalled()
  })

  it("rejects an invalid cron bearer token", async () => {
    process.env.CRON_SECRET = "expected"
    const response = await GET(
      new Request("https://dashboard.example/api/crm/sync/gmail", {
        headers: { authorization: "Bearer wrong" },
      }),
      context("gmail")
    )
    expect(response.status).toBe(401)
    expect(mocks.runSync).not.toHaveBeenCalled()
  })

  it("runs an authenticated source as a cron trigger", async () => {
    process.env.CRON_SECRET = "expected"
    const response = await GET(
      new Request("https://dashboard.example/api/crm/sync/gmail", {
        headers: { authorization: "Bearer expected" },
      }),
      context("gmail")
    )
    expect(response.status).toBe(200)
    expect(mocks.runSync).toHaveBeenCalledWith({}, "gmail", "interval")
  })

  it("accepts the cron secret in the manual operations header", async () => {
    process.env.CRON_SECRET = "expected"
    const response = await GET(
      new Request("https://dashboard.example/api/crm/sync/stripe", {
        headers: { "x-crm-cron-secret": "expected" },
      }),
      context("stripe")
    )
    expect(response.status).toBe(200)
    expect(mocks.runSync).toHaveBeenCalledWith({}, "stripe", "interval")
  })

  it("reports a failed cron run as an HTTP failure", async () => {
    process.env.CRON_SECRET = "expected"
    mocks.runSync.mockResolvedValueOnce({
      runId: "run-1",
      status: "error",
      message: "Gmail unavailable",
    })

    const response = await GET(
      new Request("https://dashboard.example/api/crm/sync/gmail", {
        headers: { authorization: "Bearer expected" },
      }),
      context("gmail")
    )

    expect(response.status).toBe(500)
  })

  it("rejects cross-site manual sync requests", async () => {
    const response = await POST(
      new Request("https://dashboard.example/api/crm/sync/gmail", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      context("gmail")
    )
    expect(response.status).toBe(403)
    expect(mocks.runSync).not.toHaveBeenCalled()
  })

  it("runs a full manual bootstrap in dependency order", async () => {
    const response = await POST(
      new Request("https://dashboard.example/api/crm/sync/all", {
        method: "POST",
        headers: { origin: "https://dashboard.example" },
      }),
      context("all")
    )

    expect(response.status).toBe(200)
    expect(mocks.runSync.mock.calls.map((call) => call.slice(1))).toEqual([
      ["stripe", "manual"],
      ["gmail", "manual"],
      ["supabase", "manual"],
    ])
  })
})
