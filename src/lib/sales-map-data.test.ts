import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import type { InstitutionRecord } from "@/lib/sales-map"

/**
 * Guards on the shipped map data (public/data/sales-map). Before pinning
 * (scripts/pin-sales-map-locations.mjs), 3,048 high school teams sat stacked
 * on city-center points and 204 sat 40+ km from their city; after, 144 and
 * 33. A rebuild that drops the pins fails here instead of quietly piling
 * names back up on the map.
 */
const records = (
  JSON.parse(readFileSync("public/data/sales-map/institutions.json", "utf8")) as { records: InstitutionRecord[] }
).records
const highSchools = records.filter((record) => record[2] === "high-school")

describe("sales map data", () => {
  it("keeps few high school teams stacked on one shared point", () => {
    const counts = new Map<string, number>()
    for (const record of highSchools) {
      const key = `${record[5].toFixed(4)}|${record[6].toFixed(4)}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const stacked = [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0)
    expect(stacked).toBeLessThan(300)
  })

  it("keeps metro areas compact: Dallas no longer reaches Clarksville or Paris", () => {
    const dallas = highSchools.filter((record) => record[3] === "TX" && record[7] === "Dallas").map((record) => record[4])
    expect(dallas.length).toBeGreaterThan(200)
    expect(dallas).not.toContain("Clarksville")
    expect(dallas).not.toContain("Paris")
  })

  it("puts Paschal at its Forest Park Blvd campus, not the Fort Worth city center", () => {
    const paschal = highSchools.find((record) => record[0] === "hsfb:paschal-panthers")
    expect(paschal?.[5]).toBeCloseTo(-97.3515, 3)
    expect(paschal?.[6]).toBeCloseTo(32.7078, 3)
  })
})
