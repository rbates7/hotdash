import type { Feature, FeatureCollection, Geometry, MultiPoint, Point } from "geojson"

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

/**
 * Fan out teams that share one coordinate so dots stay readable when zoomed
 * in. A handful go on a small ring; a big stack (57 Houston teams have only
 * the city-center point, no street address) becomes a sunflower spiral with
 * `spacing` px between neighbours so every dot can be seen and tapped.
 */
export function spreadScreenPoints(
  records: readonly InstitutionRecord[],
  project: (lon: number, lat: number) => [number, number] | null,
  ringRadius: number,
  spacing = 0
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
    if (spacing > 0 && group.length > 8) {
      const golden = Math.PI * (3 - Math.sqrt(5))
      group.forEach((record, index) => {
        const r = spacing * 0.62 * Math.sqrt(index + 0.5)
        const angle = index * golden
        layout.set(record[0], [base[0] + Math.cos(angle) * r, base[1] + Math.sin(angle) * r])
      })
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

type Bounds = [[number, number], [number, number]]

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

/**
 * Bounds that hold the bulk of a metro or city's teams. A few teams carry a
 * metro tag far from the metro itself (Houston has one near the Oklahoma
 * line), so with 20+ teams the outer `trim` share on each side is ignored
 * instead of stretching the view across the whole state.
 */
export function focusInstitutionBounds(
  allRecords: readonly InstitutionRecord[],
  { trim = 0.04, minRecords = 20, maxRadius = 0 }: { trim?: number; minRecords?: number; maxRadius?: number } = {}
): Bounds | null {
  if (allRecords.length === 0) return null
  let records = allRecords
  if (maxRadius > 0) {
    // City view: keep teams within maxRadius degrees of the median point, so
    // a "Houston" team geocoded near the Oklahoma line can't shrink the city.
    const lon = quantile(allRecords.map((record) => record[5]).sort((a, b) => a - b), 0.5)
    const lat = quantile(allRecords.map((record) => record[6]).sort((a, b) => a - b), 0.5)
    const scale = Math.cos((lat * Math.PI) / 180)
    const near = allRecords.filter(
      (record) => Math.hypot((record[5] - lon) * scale, record[6] - lat) <= maxRadius
    )
    if (near.length) records = near
  }
  if (records.length < minRecords || trim <= 0) return institutionRecordsBounds(records)
  const lons = records.map((record) => record[5]).sort((a, b) => a - b)
  const lats = records.map((record) => record[6]).sort((a, b) => a - b)
  return [
    [quantile(lons, trim), quantile(lats, trim)],
    [quantile(lons, 1 - trim), quantile(lats, 1 - trim)],
  ]
}

/**
 * The four corners of a lon/lat box as a MultiPoint. d3-geo reads polygon
 * rings by winding order on the sphere, so a counter-clockwise box ring is
 * "the whole globe except this box" and fitExtent zooms all the way out.
 * Corners have no winding, so the projection fits the box itself.
 */
export function boundsCorners(bounds: Bounds): Feature<MultiPoint> {
  const [[west, south], [east, north]] = bounds
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPoint", coordinates: [[west, south], [east, south], [east, north], [west, north]] },
  }
}

/** "Bay Area" is already an area; everything else reads "Houston area". */
export function metroLabel(metro: string): string {
  const name = metro.trim()
  return /\barea$/i.test(name) ? name : `${name} area`
}

const CITY_NAME_OVERRIDES: Record<string, string> = {
  "butte silver bow": "Butte",
  "urban honolulu": "Honolulu",
}

/**
 * Census place names, cleaned for labels and lists:
 * "Nashville-Davidson metropolitan government (balance)" -> "Nashville",
 * "Urban Honolulu" -> "Honolulu", "San Buenaventura (Ventura)" -> "Ventura".
 * Ordinary hyphenated names (Winston-Salem, Wilkes-Barre) stay as they are.
 */
export function displayCityName(name: string): string {
  const trimmed = name.trim()
  let value = trimmed.replace(/\s*\(balance\)\s*$/i, "")
  const alias = value.match(/\(([^)]+)\)\s*$/)
  if (alias) return alias[1].trim()
  const override = CITY_NAME_OVERRIDES[normalizeTerritoryToken(value)]
  if (override) return override
  // Only "Indianapolis city (balance)" carries a legal suffix; "Texas City"
  // and "League City" are real names and keep their "City".
  if (value !== trimmed) value = value.replace(/\s+(city|town|village|municipality)$/i, "")
  if (/\b(government|urban county|county)\b/i.test(value) && /[-/]/.test(value)) {
    value = value.split(/[-/]/)[0]
  }
  return value.trim()
}

export type LabelCandidate = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type PlacedLabel = LabelCandidate & { left: number; top: number }

/**
 * Greedy label placement: candidates come in priority order (biggest city
 * first); each tries right of its dot, then left, and is dropped when both
 * spots would overlap a label already placed or leave the canvas.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  width: number,
  height: number,
  { gap = 5, margin = 2 }: { gap?: number; margin?: number } = {}
): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const overlaps = (left: number, top: number, w: number, h: number) =>
    placed.some(
      (other) =>
        left < other.left + other.width + margin &&
        left + w + margin > other.left &&
        top < other.top + other.height + margin &&
        top + h + margin > other.top
    )
  for (const candidate of candidates) {
    const top = candidate.y - gap - candidate.height
    const spots = [candidate.x + gap, candidate.x - gap - candidate.width]
    for (const left of spots) {
      if (left < 0 || top < 0 || left + candidate.width > width || top + candidate.height > height) continue
      if (overlaps(left, top, candidate.width, candidate.height)) continue
      placed.push({ ...candidate, left, top })
      break
    }
  }
  return placed
}

/**
 * Push apart dots that sit closer than `minDistance` (different schools on
 * near-identical coordinates) so each one can be seen and tapped. A few
 * passes of pairwise repulsion on a coarse grid; ids keep their order.
 */
export function relaxScreenPoints(
  layout: ReadonlyMap<string, [number, number]>,
  minDistance: number,
  iterations = 6
): Map<string, [number, number]> {
  const ids = [...layout.keys()]
  const points = ids.map((id) => [...(layout.get(id) as [number, number])] as [number, number])
  if (minDistance <= 0 || points.length < 2) return new Map(ids.map((id, index) => [id, points[index]]))
  for (let pass = 0; pass < iterations; pass += 1) {
    const grid = new Map<string, number[]>()
    points.forEach(([x, y], index) => {
      const key = `${Math.floor(x / minDistance)}|${Math.floor(y / minDistance)}`
      const cell = grid.get(key) ?? []
      cell.push(index)
      grid.set(key, cell)
    })
    let moved = false
    points.forEach((point, index) => {
      const cx = Math.floor(point[0] / minDistance)
      const cy = Math.floor(point[1] / minDistance)
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const other of grid.get(`${cx + dx}|${cy + dy}`) ?? []) {
            if (other <= index) continue
            const target = points[other]
            let vx = target[0] - point[0]
            let vy = target[1] - point[1]
            let distance = Math.hypot(vx, vy)
            if (distance >= minDistance) continue
            if (distance < 1e-6) {
              const angle = (other * 2.399963) % (Math.PI * 2)
              vx = Math.cos(angle)
              vy = Math.sin(angle)
              distance = 1
            } else {
              vx /= distance
              vy /= distance
            }
            const push = (minDistance - Math.min(distance, minDistance)) / 2
            point[0] -= vx * push
            point[1] -= vy * push
            target[0] += vx * push
            target[1] += vy * push
            moved = true
          }
        }
      }
    })
    if (!moved) break
  }
  return new Map(ids.map((id, index) => [id, points[index]]))
}

export type SearchCandidate<T> = {
  type: "metro" | "city" | "institution"
  /** What the user is most likely typing: the metro, city, or team name. */
  name: string
  /** For a team, its city; matched after the name. */
  place?: string
  /** Bigger places first among equal matches (team count). */
  weight: number
  value: T
}

const SEARCH_TYPE_ORDER = { metro: 0, city: 1, institution: 2 } as const

function searchTier(query: string, name: string, place: string | undefined): number {
  const value = normalizeTerritoryToken(name)
  if (value === query) return 0
  if (value.startsWith(`${query} `) || value.startsWith(query)) return 1
  if (place && normalizeTerritoryToken(place) === query) return 2
  if (` ${value}`.includes(` ${query}`)) return 3
  if (value.includes(query)) return 4
  if (place && normalizeTerritoryToken(place).includes(query)) return 5
  return -1
}

/**
 * Rank search hits so "Dallas" leads with the Dallas metro and Dallas, TX
 * (the biggest exact matches), then teams named Dallas, then teams in a
 * town called Dallas, then looser matches.
 */
export function rankSearchMatches<T>(
  rawQuery: string,
  candidates: Iterable<SearchCandidate<T>>,
  limit = 12
): SearchCandidate<T>[] {
  const query = normalizeTerritoryToken(rawQuery)
  if (!query) return []
  const scored: Array<{ candidate: SearchCandidate<T>; tier: number }> = []
  for (const candidate of candidates) {
    const tier = searchTier(query, candidate.name, candidate.place)
    if (tier >= 0) scored.push({ candidate, tier })
  }
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      SEARCH_TYPE_ORDER[a.candidate.type] - SEARCH_TYPE_ORDER[b.candidate.type] ||
      b.candidate.weight - a.candidate.weight ||
      a.candidate.name.localeCompare(b.candidate.name, "en", { sensitivity: "base" })
  )
  return scored.slice(0, limit).map((item) => item.candidate)
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
