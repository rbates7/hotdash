import { geoMercator } from "d3-geo"
import { describe, expect, it } from "vitest"

import {
  boundsCorners,
  displayCityName,
  featureBounds,
  focusInstitutionBounds,
  IDENTITY_VIEW,
  maxprepsLink,
  metroLabel,
  panView,
  placeLabels,
  rankSearchMatches,
  relaxScreenPoints,
  type SearchCandidate,
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
  zoomViewAt,
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

describe("territory map zoom and labels (Nov 10 fixes)", () => {
  const team = (id: string, lon: number, lat: number, city = "Houston", metro = "Houston"): InstitutionRecord => [
    id,
    `School ${id}`,
    "high-school",
    "TX",
    city,
    lon,
    lat,
    metro,
  ]

  it("fits a metro's box instead of the whole globe", () => {
    const bounds: [[number, number], [number, number]] = [[-95.8, 29.4], [-95.0, 30.2]]
    const projection = geoMercator().fitExtent([[24, 24], [776, 536]], boundsCorners(bounds))
    const [left, top] = projection([-95.8, 30.2]) as [number, number]
    const [right, bottom] = projection([-95.0, 29.4]) as [number, number]
    // The box spans the map (one axis edge to edge), not a few pixels in the middle.
    expect(Math.max((right - left) / 752, (bottom - top) / 512)).toBeGreaterThan(0.95)
    expect(left).toBeGreaterThanOrEqual(23.9)
    expect(bottom).toBeLessThanOrEqual(536.1)
  })

  it("ignores a stray team or two when sizing a metro view", () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      team(`t${index}`, -95.6 + (index % 8) * 0.05, 29.6 + Math.floor(index / 8) * 0.05)
    )
    records.push(team("stray", -99.3, 34.3))
    const [[west, south], [east, north]] = focusInstitutionBounds(records) as [[number, number], [number, number]]
    expect(west).toBeGreaterThan(-96)
    expect(north).toBeLessThan(30.1)
    expect(east).toBeLessThan(-95)
    expect(south).toBeGreaterThan(29.5)
    // Small sets keep every team in view.
    expect(focusInstitutionBounds(records.slice(-5))?.[0][0]).toBe(-99.3)
    expect(focusInstitutionBounds([])).toBeNull()
  })

  it("never says 'area area'", () => {
    expect(metroLabel("Houston")).toBe("Houston area")
    expect(metroLabel("Bay Area")).toBe("Bay Area")
    expect(metroLabel("Hazleton Area")).toBe("Hazleton Area")
  })

  it("cleans Census place names for labels", () => {
    expect(displayCityName("Nashville-Davidson metropolitan government (balance)")).toBe("Nashville")
    expect(displayCityName("Urban Honolulu")).toBe("Honolulu")
    expect(displayCityName("Louisville/Jefferson County metro government (balance)")).toBe("Louisville")
    expect(displayCityName("Athens-Clarke County unified government (balance)")).toBe("Athens")
    expect(displayCityName("Augusta-Richmond County consolidated government (balance)")).toBe("Augusta")
    expect(displayCityName("Lexington-Fayette urban county")).toBe("Lexington")
    expect(displayCityName("Macon-Bibb County")).toBe("Macon")
    expect(displayCityName("Indianapolis city (balance)")).toBe("Indianapolis")
    expect(displayCityName("San Buenaventura (Ventura)")).toBe("Ventura")
    expect(displayCityName("Butte-Silver Bow (balance)")).toBe("Butte")
    expect(displayCityName("Winston-Salem")).toBe("Winston-Salem")
    expect(displayCityName("Houston")).toBe("Houston")
    expect(displayCityName("Texas City")).toBe("Texas City")
    expect(displayCityName("League City")).toBe("League City")
    expect(displayCityName("Milford city (balance)")).toBe("Milford")
  })

  it("drops labels that would overlap a bigger city's label or leave the map", () => {
    const placed = placeLabels(
      [
        { id: "boston", x: 100, y: 100, width: 50, height: 11 },
        { id: "cambridge", x: 104, y: 102, width: 60, height: 11 },
        { id: "worcester", x: 300, y: 100, width: 60, height: 11 },
        { id: "edge", x: 395, y: 50, width: 40, height: 11 },
      ],
      400,
      300
    )
    const ids = placed.map((label) => label.id)
    expect(ids).toContain("boston")
    expect(ids).toContain("worcester")
    expect(ids).toContain("edge")
    // Near the right edge the label flips to the left of its dot.
    expect(placed.find((label) => label.id === "edge")?.left).toBeLessThan(395)
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue
        const overlap = a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
        expect(overlap).toBe(false)
      }
    }
  })

  it("spirals a big same-point stack into tappable dots and keeps a city view on the city", () => {
    const stack = Array.from({ length: 57 }, (_, index) => team(`h${index}`, -95.38881, 29.78574))
    const layout = spreadScreenPoints(stack, () => [200, 200], 16, 14)
    const points = [...layout.values()]
    let closest = Infinity
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        closest = Math.min(closest, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]))
      }
    }
    expect(closest).toBeGreaterThan(9)
    const located = [team("a", -95.59, 29.95), team("b", -95.34, 29.72), team("ok", -99.3, 34.3)]
    const [[west, south], [east, north]] = focusInstitutionBounds([...stack, ...located], { trim: 0, maxRadius: 0.4 }) as [
      [number, number],
      [number, number],
    ]
    expect(west).toBeCloseTo(-95.59)
    expect(east).toBeCloseTo(-95.34)
    expect(south).toBeCloseTo(29.72)
    expect(north).toBeCloseTo(29.95)
  })

  it("pushes near-identical dots apart so each can be tapped", () => {
    const layout = new Map<string, [number, number]>([
      ["a", [100, 100]],
      ["b", [101, 100]],
      ["c", [100, 101]],
      ["far", [300, 300]],
    ])
    const relaxed = relaxScreenPoints(layout, 10, 20)
    const points = ["a", "b", "c"].map((id) => relaxed.get(id) as [number, number])
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1])).toBeGreaterThan(8)
      }
    }
    expect(relaxed.get("far")).toEqual([300, 300])
  })

  it("ranks Dallas, TX and the Dallas metro ahead of schools elsewhere", () => {
    const candidates: SearchCandidate<string>[] = [
      { type: "institution", name: "Dallas County", place: "Plantersville", weight: 1, value: "AL school" },
      { type: "institution", name: "East Paulding", place: "Dallas", weight: 1, value: "GA school" },
      { type: "city", name: "Dallas", weight: 4, value: "Dallas, GA" },
      { type: "city", name: "Dallas", weight: 69, value: "Dallas, TX" },
      { type: "metro", name: "Dallas", weight: 325, value: "Dallas metro" },
      { type: "institution", name: "Dallas", place: "Dallas", weight: 1, value: "Dallas HS, OR" },
      { type: "institution", name: "Highland Park", place: "Dallas", weight: 1, value: "TX school" },
    ]
    const ranked = rankSearchMatches("dallas", candidates).map((item) => item.value)
    expect(ranked.slice(0, 3)).toEqual(["Dallas metro", "Dallas, TX", "Dallas, GA"])
    expect(ranked.indexOf("AL school")).toBeGreaterThan(ranked.indexOf("Dallas HS, OR"))
    expect(rankSearchMatches("  ", candidates)).toEqual([])
    expect(rankSearchMatches("dallas", candidates, 2)).toHaveLength(2)
  })
})

describe("free zoom", () => {
  it("keeps the point under the cursor fixed while zooming", () => {
    const view = zoomViewAt(IDENTITY_VIEW, 4, [100, 50])
    expect(view.k).toBe(4)
    // A fitted point at the cursor stays at the cursor: 100 * 4 + x = 100.
    expect(100 * view.k + view.x).toBeCloseTo(100)
    expect(50 * view.k + view.y).toBeCloseTo(50)
  })

  it("clamps to the limits and snaps back to the fitted view at the minimum", () => {
    expect(zoomViewAt({ k: 2, x: -40, y: -10 }, 0.25, [0, 0])).toEqual(IDENTITY_VIEW)
    expect(zoomViewAt(IDENTITY_VIEW, 1e9, [0, 0], { min: 1, max: 64 }).k).toBe(64)
  })

  it("pans only once zoomed in", () => {
    expect(panView(IDENTITY_VIEW, 10, 10)).toBe(IDENTITY_VIEW)
    expect(panView({ k: 2, x: 0, y: 0 }, 10, -5)).toEqual({ k: 2, x: 10, y: -5 })
  })
})

describe("maxprepsLink", () => {
  it("links MaxPreps-roster teams in a rollout state straight to their football page", () => {
    expect(maxprepsLink(["hsfb:juneau-douglas-crimson-bears", "Juneau-Douglas", "high-school", "AK", "Juneau", 0, 0])).toEqual({
      href: "https://www.maxpreps.com/ak/juneau/juneau-douglas-crimson-bears/football/",
      direct: true,
    })
    expect(maxprepsLink(["hsfb:x-hawks", "X", "high-school", "IA", "Le Mars", 0, 0])?.href).toBe(
      "https://www.maxpreps.com/ia/le-mars/x-hawks/football/"
    )
  })

  it("searches MaxPreps for schools without a MaxPreps slug, or with a made-unique one", () => {
    const nces = maxprepsLink(["public:190001", "Ankeny", "high-school", "IA", "Ankeny", 0, 0])
    expect(nces?.direct).toBe(false)
    expect(nces?.href).toContain(encodeURIComponent("site:maxpreps.com Ankeny Ankeny IA football"))
    expect(maxprepsLink(["hsfb:central-ia", "Central", "high-school", "IA", "Elkader", 0, 0])?.direct).toBe(false)
  })

  it("is off outside the rollout states and for colleges", () => {
    expect(maxprepsLink(["hsfb:paschal-panthers", "Paschal", "high-school", "TX", "Fort Worth", 0, 0])).toBeNull()
    expect(maxprepsLink(["college:1", "Iowa", "college", "IA", "Iowa City", 0, 0])).toBeNull()
  })
})
