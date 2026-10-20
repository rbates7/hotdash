import { describe, expect, it } from "vitest"

import { buildIssues, buildSprints } from "@/lib/issues-fixture"
import { SEED_ISSUE_KEYS, SEED_LAST_ISSUE_NUMBER, SEED_SPRINT_IDS } from "@/lib/issues-seed-ids"

describe("issues seed ids", () => {
  const now = new Date("2026-10-19T12:00:00Z")
  it("are exactly the demo board's ticket keys and sprint ids", () => {
    expect([...SEED_ISSUE_KEYS].sort()).toEqual(buildIssues(now).map((i) => i.key).sort())
    expect([...SEED_SPRINT_IDS].sort()).toEqual(buildSprints(now).map((s) => s.id).sort())
  })
  it("name the demo's highest ticket number", () => {
    const highest = Math.max(...buildIssues(now).map((i) => Number(i.key.split("-")[1])))
    expect(SEED_LAST_ISSUE_NUMBER).toBe(highest)
  })
})
