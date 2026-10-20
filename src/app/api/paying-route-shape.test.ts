// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { createPayingSource, setPayingSource } from "@/lib/server/paying-coaches"

// Not mocked: the real route and the real source (the database setting
// unset), so this pins the exact keys the browser receives.
const after = vi.hoisted(() => vi.fn<(task: () => unknown) => void>())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET } = await import("@/app/api/subscriptions/paying/route")
const saved = process.env.SUPABASE_READONLY_DB_URL

afterEach(() => {
  setPayingSource(null)
  if (saved === undefined) delete process.env.SUPABASE_READONLY_DB_URL
  else process.env.SUPABASE_READONLY_DB_URL = saved
})

describe("GET /api/subscriptions/paying, real source", () => {
  it("with SUPABASE_READONLY_DB_URL unset: exactly { status: 'not_connected' }", async () => {
    delete process.env.SUPABASE_READONLY_DB_URL
    setPayingSource(createPayingSource({ query: async () => { throw new Error("must not query") } }))
    const body = (await (await GET()).json()) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(["status"])
    expect(body).toEqual({ status: "not_connected" })
  })
  it("after a read: exactly status, counts, asOf; counts exactly the five keys", async () => {
    const src = createPayingSource({
      env: () => ({ SUPABASE_READONLY_DB_URL: "postgresql://ro:not-a-real-password@127.0.0.1:5432/postgres" }),
      query: async () => ({ appStore: 1, stripe: 2, invoice: 3, other: 0, total: 5 }),
      log: () => {},
    })
    setPayingSource(src)
    await GET()
    await src.settled()
    const body = (await (await GET()).json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(["asOf", "counts", "status"])
    expect(Object.keys(body.counts as object).sort()).toEqual(["appStore", "invoice", "other", "stripe", "total"])
    expect(body.status).toBe("connected")
  })
})
