import type { Feature, FeatureCollection, Geometry, Point, Polygon } from "geojson"

import type { Deal, Stage } from "@/lib/sales-opportunities"

export type InstitutionKind = "high-school" | "college" | "nfl"
export type OpportunityStatus = "customer" | "engaged" | "available"
export type InstitutionRecord = [
  id: string,
  name: string,
  kind: InstitutionKind,
  state: string,
  city: string,
  lon: number,
  lat: number,
  metro?: string,
]
export const MAJOR_CITY_MIN_POPULATION = 50_000

export type CityRecord = [
  id: string,
  name: string,
  kind: "city",
  state: string,
  lon: number,
  lat: number,
  population?: number,
]

export type InstitutionProperties = {
  id: string
  name: string
  kind: InstitutionKind
  state: string
  city: string
  status: OpportunityStatus
}

const ACTIVE_STAGES: ReadonlySet<Stage> = new Set(["talking", "proposal", "verbal"])

/** Green wins over yellow when several deals point at the same institution. */
export function opportunityStatus(deals: readonly Pick<Deal, "institutionId" | "stage">[]): Map<string, OpportunityStatus> {
  const statuses = new Map<string, OpportunityStatus>()
  for (const deal of deals) {
    if (!deal.institutionId) continue
    const current = statuses.get(deal.institutionId)
    if (deal.stage === "closed-won") {
      statuses.set(deal.institutionId, "customer")
    } else if (ACTIVE_STAGES.has(deal.stage) && current !== "customer") {
      statuses.set(deal.institutionId, "engaged")
    }
  }
  return statuses
}

function overviewCoordinate([lon, lat]: [number, number], state: string): [number, number] {
  if (state === "AK") return [-127 + (lon + 180) * 0.32, 22.5 + (lat - 51) * 0.32]
  if (state === "HI") return [-111 + (lon + 161) * 0.7, 23 + (lat - 18.8) * 0.7]
  return [lon, lat]
}

export function institutionFeatures(
  records: readonly InstitutionRecord[],
  deals: readonly Pick<Deal, "institutionId" | "stage">[],
  overview = false
): FeatureCollection<Point, InstitutionProperties> {
  const statuses = opportunityStatus(deals)
  return {
    type: "FeatureCollection",
    features: records.map(([id, name, kind, state, city, lon, lat]) => ({
      type: "Feature",
      id,
      properties: { id, name, kind, state, city, status: statuses.get(id) ?? "available" },
      geometry: {
        type: "Point",
        coordinates: overview ? overviewCoordinate([lon, lat], state) : [lon, lat],
      },
    })),
  }
}

export function overviewStates(
  collection: FeatureCollection<Geometry, { code: string; name: string; fips: string }>
): FeatureCollection<Geometry, { code: string; name: string; fips: string }> {
  const transform = (coordinates: unknown, state: string): unknown => {
    if (
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      return overviewCoordinate([coordinates[0], coordinates[1]], state)
    }
    return Array.isArray(coordinates) ? coordinates.map((item) => transform(item, state)) : coordinates
  }

  return {
    ...collection,
    features: collection.features.map((item) => {
      const state = item.properties.code
      if (state !== "AK" && state !== "HI") return item
      return {
        ...item,
        geometry: {
          ...item.geometry,
          coordinates: transform("coordinates" in item.geometry ? item.geometry.coordinates : [], state),
        } as Geometry,
      } as Feature<Geometry, { code: string; name: string; fips: string }>
    }),
  }
}

export function normalizeTerritoryToken(value: string): string {
  let token = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (const prefix of [
    "city of ",
    "town of ",
    "village of ",
    "borough of ",
    "unified government of ",
    "metro government of ",
  ]) {
    if (token.startsWith(prefix)) token = token.slice(prefix.length).trim()
  }
  return token
}

export function normalizeSchoolName(name: string): string {
  let normalized = normalizeTerritoryToken(name)
  for (const suffix of [
    " high school",
    " senior high school",
    " junior senior high school",
    " middle high school",
    " hs",
    " academy",
    " preparatory school",
    " prep school",
    " prep",
    " school",
  ]) {
    if (normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length).trim()
  }
  return normalized
}

export function territoryMatchKey(name: string, city: string, state: string): string {
  return `${state.trim().toUpperCase()}|${normalizeTerritoryToken(city)}|${normalizeSchoolName(name)}`
}

export function normalizePlaceName(name: string): string {
  let token = normalizeTerritoryToken(name)
  for (const suffix of [" city", " town", " village", " cdp", " borough", " municipality", " ut"]) {
    if (token.endsWith(suffix)) token = token.slice(0, -suffix.length).trim()
  }
  return token
}

export function territoryCityKey(city: string, state: string): string {
  return `${state.trim().toUpperCase()}|${normalizePlaceName(city)}`
}

export function institutionMetro(record: InstitutionRecord): string {
  return String(record[7] ?? "").trim()
}

export function territoryMetroKey(metro: string, state: string): string {
  return `${state.trim().toUpperCase()}|${normalizeTerritoryToken(metro)}`
}

export function cityPopulation(record: CityRecord): number {
  const value = record[6]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function isMajorCity(record: CityRecord): boolean {
  return cityPopulation(record) >= MAJOR_CITY_MIN_POPULATION
}

export function pointInBounds(
  lon: number,
  lat: number,
  bounds: [[number, number], [number, number]]
): boolean {
  const [[west, south], [east, north]] = bounds
  return lon >= west && lon <= east && lat >= south && lat <= north
}

/** Fan out teams that share one coordinate so dots stay readable when zoomed in. */
export function spreadScreenPoints(
  records: readonly InstitutionRecord[],
  project: (lon: number, lat: number) => [number, number] | null,
  ringRadius: number
): Map<string, [number, number]> {
  const groups = new Map<string, InstitutionRecord[]>()
  for (const record of records) {
    const key = `${record[5].toFixed(4)}|${record[6].toFixed(4)}`
    const list = groups.get(key) ?? []
    list.push(record)
    groups.set(key, list)
  }

  const layout = new Map<string, [number, number]>()
  for (const group of groups.values()) {
    const base = project(group[0][5], group[0][6])
    if (!base) continue
    if (group.length === 1) {
      layout.set(group[0][0], base)
      continue
    }
    const radius = Math.min(ringRadius, 6 + group.length * 0.65)
    group.forEach((record, index) => {
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2
      layout.set(record[0], [base[0] + Math.cos(angle) * radius, base[1] + Math.sin(angle) * radius])
    })
  }
  return layout
}

export function maxprepsSlugFromUrl(url: string): string {
  const match = url.match(/maxpreps\.com\/[^/]+\/[^/]+\/([^/]+)\/football\/?$/i)
  return match?.[1] ?? ""
}

export function institutionRecordsBounds(
  records: readonly InstitutionRecord[]
): [[number, number], [number, number]] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const record of records) {
    const lon = record[5]
    const lat = record[6]
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  if (!Number.isFinite(west)) return null
  return [[west, south], [east, north]]
}

export function paddedInstitutionBounds(
  bounds: [[number, number], [number, number]],
  { padding = 0.08, minSpan = 0.12 }: { padding?: number; minSpan?: number } = {}
): [[number, number], [number, number]] {
  let [[west, south], [east, north]] = bounds
  if (east - west < minSpan) {
    const center = (west + east) / 2
    west = center - minSpan / 2
    east = center + minSpan / 2
  }
  if (north - south < minSpan) {
    const center = (south + north) / 2
    south = center - minSpan / 2
    north = center + minSpan / 2
  }
  const lonPad = (east - west) * padding
  const latPad = (north - south) * padding
  return [[west - lonPad, south - latPad], [east + lonPad, north + latPad]]
}

export function featureBounds(feature: Feature<Geometry>): [[number, number], [number, number]] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      west = Math.min(west, value[0])
      east = Math.max(east, value[0])
      south = Math.min(south, value[1])
      north = Math.max(north, value[1])
      return
    }
    if (Array.isArray(value)) value.forEach(visit)
  }
  if ("coordinates" in feature.geometry) visit(feature.geometry.coordinates)
  return [[west, south], [east, north]]
}

/* ---------------------------------------------------------------- free zoom */

/**
 * The user's own zoom on top of the fitted map: screen = fitted × k + (x, y).
 * k = 1 with no offset is the fitted view of the current state, metro or city.
 */
export type MapView = { k: number; x: number; y: number }

export const IDENTITY_VIEW: MapView = { k: 1, x: 0, y: 0 }

/** Outer bounds; the map narrows the max to street level for the view it starts from. */
export const MAP_ZOOM_LIMITS = { min: 1, max: 1024 } as const

/** Zoom by `factor` keeping `point` (screen px) under the cursor or fingers. */
export function zoomViewAt(
  view: MapView,
  factor: number,
  point: readonly [number, number],
  limits: { min: number; max: number } = MAP_ZOOM_LIMITS
): MapView {
  const k = Math.min(limits.max, Math.max(limits.min, view.k * factor))
  if (k === limits.min) return IDENTITY_VIEW
  const ratio = k / view.k
  return { k, x: point[0] - (point[0] - view.x) * ratio, y: point[1] - (point[1] - view.y) * ratio }
}

export function panView(view: MapView, dx: number, dy: number): MapView {
  if (view.k === 1) return view
  return { k: view.k, x: view.x + dx, y: view.y + dy }
}

/**
 * A lon/lat box as a polygon d3-geo reads as the box itself. d3 treats a
 * ring by its winding on the sphere: counter-clockwise (as drawn on a flat
 * map) means "everything except this box", which fits the whole globe.
 */
export function boundsPolygon(bounds: [[number, number], [number, number]]): Feature<Polygon> {
  const [[west, south], [east, north]] = bounds
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[west, south], [west, north], [east, north], [east, south], [west, south]]],
    },
  }
}

export type LabelBox = { x: number; y: number; width: number; height: number }

/**
 * Greedy label placement: keep each label whose box does not overlap one
 * already placed. Callers pass candidates in priority order (highlighted,
 * customers, engaged, then the rest), so the important names win.
 */
export function placeLabels<T extends { box: LabelBox }>(candidates: readonly T[]): T[] {
  const placed: T[] = []
  for (const candidate of candidates) {
    const a = candidate.box
    const clashes = placed.some(({ box: b }) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    )
    if (!clashes) placed.push(candidate)
  }
  return placed
}
