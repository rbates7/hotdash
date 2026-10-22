import { describe, expect, it } from "vitest"

import { createTestDb } from "@/lib/crm/db/test-client"

import { acquireSyncLease } from "./runner"

describe("sync lease", () => {
  it("allows only one overlapping owner per source", async () => {
    const { db, close } = await createTestDb()

    const attempts = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        acquireSyncLease(db, "gmail", `owner-${index}`)
      )
    )

    expect(attempts.filter(Boolean)).toHaveLength(1)
    await close()
  }, 10_000)

  it("keeps different sources independent", async () => {
    const { db, close } = await createTestDb()

    expect(
      await Promise.all([
        acquireSyncLease(db, "gmail", "gmail-owner"),
        acquireSyncLease(db, "stripe", "stripe-owner"),
      ])
    ).toEqual([true, true])
    await close()
  })
})
