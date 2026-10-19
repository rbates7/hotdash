import { describe, expect, it } from "vitest"

import { APP_STORE_NOT_CONNECTED, appStoreHealth, isSuspectAppStore, parseAppStoreSummary } from "@/lib/app-store-summary"
import { APP_STORE_CONNECTED, APP_STORE_STALE, APP_STORE_ZERO, APP_STORE_ZERO_STALE, SYNCED_AT } from "@/test/stripe-fixture"

describe("isSuspectAppStore", () => {
  it("a connected or stale count of 0 is suspect", () => {
    expect(isSuspectAppStore(APP_STORE_ZERO)).toBe(true)
    expect(isSuspectAppStore(APP_STORE_ZERO_STALE)).toBe(true)
  })

  it("a real count, or no count at all, is not", () => {
    expect(isSuspectAppStore(APP_STORE_CONNECTED)).toBe(false)
    expect(isSuspectAppStore(APP_STORE_STALE)).toBe(false)
    expect(isSuspectAppStore({ status: "connected", count: 1, asOf: SYNCED_AT })).toBe(false)
    expect(isSuspectAppStore(APP_STORE_NOT_CONNECTED)).toBe(false)
  })

  it("the wire format is unchanged: a 0 still parses as the reading it is", () => {
    expect(parseAppStoreSummary(JSON.parse(JSON.stringify(APP_STORE_ZERO)))).toEqual(APP_STORE_ZERO)
  })
})

describe("appStoreHealth", () => {
  it.each([
    [APP_STORE_CONNECTED, "ok"],
    [APP_STORE_STALE, "stale"],
    [APP_STORE_NOT_CONNECTED, "not_connected"],
    [APP_STORE_ZERO, "suspect_zero"],
    [APP_STORE_ZERO_STALE, "suspect_zero"],
  ] as const)("%o → %s", (reading, health) => {
    expect(appStoreHealth(reading)).toBe(health)
  })
})
