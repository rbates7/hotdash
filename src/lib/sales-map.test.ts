import { describe, expect, it } from "vitest"

import {
  featureBounds,
  institutionFeatures,
  institutionRecordsBounds,
  isMajorCity,
  normalizeSchoolName,
  opportunityStatus,
  overviewStates,
  paddedInstitutionBounds,
  spreadScreenPoints,
  territoryCityKey,
  territoryMatchKey,
  type CityRecord,
  type InstitutionRecord,
} from "@/lib/sales-map"
import type { Deal } from "@/lib/sales-opportunities"

const deals = (items: Array<[string | null, Deal["stage"]]>) =>
  items.map(([institutionId, stage]) => ({ institutionId, stage }))

describe("opportunityStatus", () => {
  it("uses won over active and ignores closed-lost or unmatched deals", () => {
    const status = opportunityStatus(
      deals([
        ["college:1", "proposal"],
        ["college:1", "closed-won"],
        ["college:2", "closed-lost"],
        [null, "closed-won"],
      ])
    )
    expect(status.get("college:1")).toBe("customer")
    expect(status.has("college:2")).toBe(false)
    expect(status.size).toBe(1)
  })

  it("colors every active pipeline stage as engaged", () => {
    expect([...opportunityStatus(deals([
      ["public:1", "talking"],
      ["public:2", "proposal"],
      ["public:3", "verbal"],
    ])).values()]).toEqual(["engaged", "engaged", "engaged"])
  })
})

describe("territory matching", () => {
  it("normalizes school names for NCES joins", () => {
    expect(normalizeSchoolName("A & M Consolidated High School")).toBe("a and m consolidated")
    expect(
      territoryMatchKey("A&M Consolidated", "College Station", "TX")
    ).toBe(territoryMatchKey("A & M Consolidated High School", "College Station", "TX"))
  })

  it("normalizes place names for city keys", () => {
    expect(territoryCityKey("Dallas city", "TX")).toBe(territoryCityKey("Dallas", "TX"))
  })

  it("flags major cities from Census population", () => {
    const major: CityRecord = ["place:1", "Austin", "city", "TX", -97.74, 30.27, 975_000]
    const small: CityRecord = ["place:2", "Smallville", "city", "TX", -97, 30, 12_000]
    expect(isMajorCity(major)).toBe(true)
    expect(isMajorCity(small)).toBe(false)
  })

  it("spreads overlapping team dots in screen space", () => {
    const records: InstitutionRecord[] = [
      ["public:1", "A", "high-school", "TX", "Dallas", -96.8, 32.78],
      ["public:2", "B", "high-school", "TX", "Dallas", -96.8, 32.78],
    ]
    const layout = spreadScreenPoints(records, () => [100, 100], 12)
    expect(layout.get("public:1")).not.toEqual(layout.get("public:2"))
  })

  it("pads city team bounds for readable city zoom", () => {
    const records: InstitutionRecord[] = [
      ["public:1", "Example High", "high-school", "TX", "Austin", -97.74, 30.27],
    ]
    const bounds = institutionRecordsBounds(records)
    expect(bounds).not.toBeNull()
    const padded = paddedInstitutionBounds(bounds!)
    expect(padded[1][0] - padded[0][0]).toBeGreaterThan(0.12)
    expect(padded[1][1] - padded[0][1]).toBeGreaterThan(0.12)
  })
})

describe("map features", () => {
  const records: InstitutionRecord[] = [
    ["college:1", "Example College", "college", "TX", "Austin", -97.74, 30.27],
    ["public:2", "Example High", "high-school", "AK", "Juneau", -134.42, 58.3],
  ]

  it("keeps stable ids and adds deal status", () => {
    const features = institutionFeatures(records, deals([["college:1", "closed-won"]]))
    expect(features.features[0]).toMatchObject({
      id: "college:1",
      properties: { status: "customer", state: "TX" },
      geometry: { coordinates: [-97.74, 30.27] },
    })
    expect(features.features[1].properties.status).toBe("available")
  })

  it("moves Alaska into the overview inset without changing state zoom geometry", () => {
    const overview = institutionFeatures(records, [], true)
    expect(overview.features[1].geometry.coordinates).not.toEqual([-134.42, 58.3])
    expect(institutionFeatures(records, [], false).features[1].geometry.coordinates).toEqual([-134.42, 58.3])
  })

  it("transforms Alaska state geometry and computes bounds", () => {
    const states = {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        id: "AK",
        properties: { code: "AK", name: "Alaska", fips: "02" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [[[-140, 55], [-130, 55], [-130, 60], [-140, 55]]],
        },
      }],
    }
    const moved = overviewStates(states)
    expect("coordinates" in moved.features[0].geometry && moved.features[0].geometry.coordinates)
      .not.toEqual(states.features[0].geometry.coordinates)
    expect(featureBounds(states.features[0])).toEqual([[-140, 55], [-130, 60]])
  })
})
