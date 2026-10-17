import { describe, expect, it } from "vitest"

import { groupByState, ownerName, parseWorkboard } from "./workboard"
import { FIXTURE } from "@/test/workboard-fixture"


describe("workboard", () => {
  it("maps owner handles", () => {
    expect(ownerName("simmons-bot")).toBe("Simmons")
    expect(ownerName("Radcliffe")).toBe("Radcliffe")
    expect(ownerName("octocat")).toBe("octocat")
  })
  it("parses a connected payload", () => {
    const b = parseWorkboard(FIXTURE)
    expect(b.connected).toBe(true)
    expect(groupByState(b.items).ready_for_review).toHaveLength(1)
  })
  it("treats not connected, missing route and junk as Not connected with no items", () => {
    expect(parseWorkboard({ connected: false, fetchedAt: "x", stale: false, items: [] }).items).toEqual([])
    expect(parseWorkboard(null).connected).toBe(false)
    expect(parseWorkboard("<html>404</html>").connected).toBe(false)
  })
})
