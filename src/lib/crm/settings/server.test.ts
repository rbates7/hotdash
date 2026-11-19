import { describe, expect, it, vi } from "vitest"

import type { Db } from "@/lib/crm/db/client"

import { isSyncPaused } from "./server"

// A Db stand-in whose select chain resolves (or rejects) per call.
function fakeDb(results: Array<() => Promise<unknown[]>>): Db {
  const next = vi.fn(() => results.shift()!())
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: next,
  }
  return { select: () => chain } as unknown as Db
}

const connectTimeout = () =>
  Promise.reject(Object.assign(new Error("write CONNECT_TIMEOUT"), { code: "CONNECT_TIMEOUT" }))

describe("isSyncPaused", () => {
  it("retries once when Neon times out connecting", async () => {
    const db = fakeDb([
      connectTimeout,
      () => Promise.resolve([{ key: "sync_paused", value: "true" }]),
    ])
    await expect(isSyncPaused(db)).resolves.toBe(true)
  })

  it("retries a drizzle-wrapped CONNECT_TIMEOUT", async () => {
    const db = fakeDb([
      () =>
        Promise.reject(
          Object.assign(new Error("Failed query"), {
            cause: { code: "CONNECT_TIMEOUT" },
          })
        ),
      () => Promise.resolve([]),
    ])
    await expect(isSyncPaused(db)).resolves.toBe(false)
  })

  it("does not retry other errors or retry twice", async () => {
    await expect(
      isSyncPaused(fakeDb([() => Promise.reject(new Error("syntax error"))]))
    ).rejects.toThrow("syntax error")
    await expect(
      isSyncPaused(fakeDb([connectTimeout, connectTimeout]))
    ).rejects.toThrow("CONNECT_TIMEOUT")
  })
})
