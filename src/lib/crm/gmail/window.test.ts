import { describe, expect, it } from "vitest"

import { isValidSyncWindow, syncWindowQuery } from "./window"

describe("syncWindowQuery", () => {
  it("passes relative windows to newer_than", () => {
    expect(syncWindowQuery("7d")).toBe("newer_than:7d")
    expect(syncWindowQuery("8m")).toBe("newer_than:8m")
    expect(syncWindowQuery("2y")).toBe("newer_than:2y")
  })

  it("turns an absolute date into an after: query", () => {
    expect(syncWindowQuery("2026-01-01")).toBe("after:2026/01/01")
  })

  it("tolerates surrounding whitespace", () => {
    expect(syncWindowQuery("  2026-01-01 ")).toBe("after:2026/01/01")
  })

  it("rejects impossible and malformed dates", () => {
    expect(syncWindowQuery("2026-02-31")).toBeNull()
    expect(syncWindowQuery("2026-13-01")).toBeNull()
    expect(syncWindowQuery("2026/01/01")).toBeNull()
    expect(syncWindowQuery("jan 1 2026")).toBeNull()
    expect(syncWindowQuery("30")).toBeNull()
    expect(syncWindowQuery("30w")).toBeNull()
    expect(syncWindowQuery("")).toBeNull()
  })

  it("reports validity for the preflight check", () => {
    expect(isValidSyncWindow("2026-01-01")).toBe(true)
    expect(isValidSyncWindow("nonsense")).toBe(false)
  })
})
