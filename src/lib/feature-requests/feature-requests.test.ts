import { describe, expect, it } from "vitest"

import {
  STATUS_CONFIG,
  STATUS_ORDER,
  byStatus,
  isFeatureStatus,
  sortNewestFirst,
  type FeatureRequest,
} from "@/lib/feature-requests/feature-requests"
import { buildSeed } from "@/lib/feature-requests/fixture"

const TODAY = new Date("2026-08-24T15:00:00.000Z")

describe("statuses", () => {
  it("are the mock's four columns, left to right", () => {
    expect(STATUS_ORDER.map((s) => STATUS_CONFIG[s].label)).toEqual([
      "Inbox",
      "Triaged",
      "On Roadmap",
      "Parked",
    ])
  })

  it("rejects anything that is not one of them", () => {
    expect(isFeatureStatus("inbox")).toBe(true)
    expect(isFeatureStatus("done")).toBe(false)
    expect(isFeatureStatus(3)).toBe(false)
  })
})

describe("ordering", () => {
  it("sorts newest first within a column without mutating the input", () => {
    const seed = buildSeed(TODAY)
    const shuffled = [...seed].reverse()
    const inbox = byStatus(shuffled, "inbox")
    expect(inbox.map((r) => r.title)).toEqual([
      "Play of the Day",
      "Web import from a link",
      "Staff share sheet",
    ])
    expect(shuffled[0].title).toBe("Parent recap emails")
  })

  it("puts a card added today above the seed", () => {
    const seed = buildSeed(TODAY)
    const fresh: FeatureRequest = {
      id: "fr-99",
      title: "Brand new",
      ask: "",
      from: "Dan",
      status: "inbox",
      createdAt: "2026-08-24T16:00:00.000Z",
      updatedAt: "2026-08-24T16:00:00.000Z",
    }
    expect(sortNewestFirst([...seed, fresh])[0].id).toBe("fr-99")
  })
})
