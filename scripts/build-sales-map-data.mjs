import { readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parse } from "csv-parse/sync"
import { unzipSync } from "fflate"
import { feature } from "topojson-client"
import XLSX from "xlsx"

const OUTPUT_DIR = new URL("../public/data/sales-map/", import.meta.url)
const HS_FOOTBALL_CSV = new URL("../data/sales-map/high-school-football.csv", import.meta.url)
const CACHE_DIR = join(tmpdir(), "hotdash-sales-map")
const VERSION = 3

const SOURCES = {
  highSchoolFootball: {
    year: "2026",
    note: "Sanitized MaxPreps full-US football roster (team, city, state, classification, maxpreps_url).",
    file: "data/sales-map/high-school-football.csv",
  },
  publicLocations: {
    year: "2024-25",
    url: "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2425/MapServer/0",
  },
  privateLocations: {
    year: "2023-24",
    url: "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PRIVATESCH_2324/MapServer/0",
  },
  colleges: {
    year: "2023-24",
    url: "https://nces.ed.gov/opengis/rest/services/Postsecondary_School_Locations/EDGE_GEOCODE_POSTSECONDARYSCH_2324/MapServer/0",
  },
  eadaFootball: {
    year: "2023-24",
    url: "https://ope.ed.gov/athletics/api/dataFiles/file?fileName=EADA_2023-2024.zip",
  },
  cities: {
    year: "2025",
    url: "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gaz_place_national.zip",
  },
  placePopulation: {
    year: "2023",
    url: "https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/sub-est2023.csv",
  },
  states: {
    year: "2020",
    package: "us-atlas@3.0.1",
    license: "CC0-1.0",
  },
  nfl: {
    year: "2026",
    note: "Reviewed static list of the 32 NFL clubs and their current home venues.",
  },
}

const STATES = {
  "01": ["AL", "Alabama"],
  "02": ["AK", "Alaska"],
  "04": ["AZ", "Arizona"],
  "05": ["AR", "Arkansas"],
  "06": ["CA", "California"],
  "08": ["CO", "Colorado"],
  "09": ["CT", "Connecticut"],
  "10": ["DE", "Delaware"],
  "11": ["DC", "District of Columbia"],
  "12": ["FL", "Florida"],
  "13": ["GA", "Georgia"],
  "15": ["HI", "Hawaii"],
  "16": ["ID", "Idaho"],
  "17": ["IL", "Illinois"],
  "18": ["IN", "Indiana"],
  "19": ["IA", "Iowa"],
  "20": ["KS", "Kansas"],
  "21": ["KY", "Kentucky"],
  "22": ["LA", "Louisiana"],
  "23": ["ME", "Maine"],
  "24": ["MD", "Maryland"],
  "25": ["MA", "Massachusetts"],
  "26": ["MI", "Michigan"],
  "27": ["MN", "Minnesota"],
  "28": ["MS", "Mississippi"],
  "29": ["MO", "Missouri"],
  "30": ["MT", "Montana"],
  "31": ["NE", "Nebraska"],
  "32": ["NV", "Nevada"],
  "33": ["NH", "New Hampshire"],
  "34": ["NJ", "New Jersey"],
  "35": ["NM", "New Mexico"],
  "36": ["NY", "New York"],
  "37": ["NC", "North Carolina"],
  "38": ["ND", "North Dakota"],
  "39": ["OH", "Ohio"],
  "40": ["OK", "Oklahoma"],
  "41": ["OR", "Oregon"],
  "42": ["PA", "Pennsylvania"],
  "44": ["RI", "Rhode Island"],
  "45": ["SC", "South Carolina"],
  "46": ["SD", "South Dakota"],
  "47": ["TN", "Tennessee"],
  "48": ["TX", "Texas"],
  "49": ["UT", "Utah"],
  "50": ["VT", "Vermont"],
  "51": ["VA", "Virginia"],
  "53": ["WA", "Washington"],
  "54": ["WV", "West Virginia"],
  "55": ["WI", "Wisconsin"],
  "56": ["WY", "Wyoming"],
}

const STATE_CODES = new Set(Object.values(STATES).map(([code]) => code))

const NFL_TEAMS = [
  ["Arizona Cardinals", "Glendale", "AZ", -112.2626, 33.5276],
  ["Atlanta Falcons", "Atlanta", "GA", -84.4008, 33.7554],
  ["Baltimore Ravens", "Baltimore", "MD", -76.6227, 39.278],
  ["Buffalo Bills", "Orchard Park", "NY", -78.7868, 42.7738],
  ["Carolina Panthers", "Charlotte", "NC", -80.8527, 35.2258],
  ["Chicago Bears", "Chicago", "IL", -87.6167, 41.8623],
  ["Cincinnati Bengals", "Cincinnati", "OH", -84.516, 39.0954],
  ["Cleveland Browns", "Cleveland", "OH", -81.6995, 41.5061],
  ["Dallas Cowboys", "Arlington", "TX", -97.0929, 32.7473],
  ["Denver Broncos", "Denver", "CO", -105.0201, 39.7439],
  ["Detroit Lions", "Detroit", "MI", -83.0456, 42.34],
  ["Green Bay Packers", "Green Bay", "WI", -88.0622, 44.5013],
  ["Houston Texans", "Houston", "TX", -95.4109, 29.6847],
  ["Indianapolis Colts", "Indianapolis", "IN", -86.1639, 39.7601],
  ["Jacksonville Jaguars", "Jacksonville", "FL", -81.6373, 30.3239],
  ["Kansas City Chiefs", "Kansas City", "MO", -94.4839, 39.0489],
  ["Las Vegas Raiders", "Las Vegas", "NV", -115.1833, 36.0908],
  ["Los Angeles Chargers", "Inglewood", "CA", -118.3392, 33.9535],
  ["Los Angeles Rams", "Inglewood", "CA", -118.3389, 33.9533],
  ["Miami Dolphins", "Miami Gardens", "FL", -80.2389, 25.958],
  ["Minnesota Vikings", "Minneapolis", "MN", -93.2581, 44.9735],
  ["New England Patriots", "Foxborough", "MA", -71.2643, 42.0909],
  ["New Orleans Saints", "New Orleans", "LA", -90.0812, 29.9511],
  ["New York Giants", "East Rutherford", "NJ", -74.0745, 40.8135],
  ["New York Jets", "East Rutherford", "NJ", -74.0742, 40.8133],
  ["Philadelphia Eagles", "Philadelphia", "PA", -75.1675, 39.9008],
  ["Pittsburgh Steelers", "Pittsburgh", "PA", -80.0158, 40.4468],
  ["San Francisco 49ers", "Santa Clara", "CA", -121.97, 37.403],
  ["Seattle Seahawks", "Seattle", "WA", -122.3316, 47.5952],
  ["Tampa Bay Buccaneers", "Tampa", "FL", -82.5033, 27.9759],
  ["Tennessee Titans", "Nashville", "TN", -86.7713, 36.1665],
  ["Washington Commanders", "Landover", "MD", -76.8645, 38.9076],
]

const textDecoder = new TextDecoder()

function log(message) {
  process.stdout.write(`${message}\n`)
}

function normalizeTerritoryToken(value) {
  let token = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (const prefix of ["city of ", "town of ", "village of ", "borough of ", "unified government of ", "metro government of "]) {
    if (token.startsWith(prefix)) token = token.slice(prefix.length).trim()
  }
  return token
}

function normalizeSchoolName(name) {
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

function territoryMatchKey(name, city, state) {
  return `${String(state).trim().toUpperCase()}|${normalizeTerritoryToken(city)}|${normalizeSchoolName(name)}`
}

function normalizePlaceName(name) {
  let token = normalizeTerritoryToken(name)
  for (const suffix of [" city", " town", " village", " cdp", " borough", " municipality", " ut"]) {
    if (token.endsWith(suffix)) token = token.slice(0, -suffix.length).trim()
  }
  return token
}

function territoryCityKey(city, state) {
  return `${String(state).trim().toUpperCase()}|${normalizePlaceName(city)}`
}

function placePopulationByGeoid(bytes) {
  const rows = parse(textDecoder.decode(bytes), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  const map = new Map()
  for (const row of rows) {
    if (String(row.SUMLEV) !== "162") continue
    const geoid = `${String(row.STATE).padStart(2, "0")}${String(row.PLACE).padStart(5, "0")}`
    const pop = Number(row.POPESTIMATE2023 ?? row.POPESTIMATE2022 ?? 0)
    if (Number.isFinite(pop) && pop > 0) map.set(geoid, pop)
  }
  return map
}

function displayPlaceName(name) {
  const trimmed = String(name ?? "").trim()
  return trimmed.replace(/\s+(city|town|village|CDP|borough|municipality)\.?$/i, "").trim()
}

function maxprepsSlugFromUrl(url) {
  const match = String(url ?? "").match(/maxpreps\.com\/[^/]+\/[^/]+\/([^/]+)\/football\/?$/i)
  return match?.[1] ?? ""
}

async function fetchWithRetry(url, init, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, init)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }
  throw new Error(`Unable to download ${url}: ${lastError}`)
}

async function cachedDownload(name, url) {
  await mkdir(CACHE_DIR, { recursive: true })
  const path = join(CACHE_DIR, name)
  try {
    const saved = await readFile(path)
    log(`Using cached ${name}`)
    return saved
  } catch {}

  log(`Downloading ${name}`)
  const response = await fetchWithRetry(url)
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(path, bytes)
  return bytes
}

function csvFromZip(bytes, filePattern, options = {}) {
  const files = unzipSync(bytes)
  const entry = Object.entries(files).find(([name]) => filePattern.test(name))
  if (!entry) throw new Error(`No ${filePattern} file found in ZIP`)
  return parse(textDecoder.decode(entry[1]), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    ...options,
  })
}

function coordinate(lon, lat) {
  const longitude = Number(lon)
  const latitude = Number(lat)
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null
  }
  return [Number(longitude.toFixed(5)), Number(latitude.toFixed(5))]
}

async function arcGisRows(serviceUrl, fields) {
  const countUrl = new URL(`${serviceUrl}/query`)
  countUrl.search = new URLSearchParams({
    f: "json",
    where: "1=1",
    returnCountOnly: "true",
  })
  const countJson = await (await fetchWithRetry(countUrl)).json()
  if (!Number.isInteger(countJson.count)) throw new Error(`Missing ArcGIS row count for ${serviceUrl}`)

  const pages = []
  for (let offset = 0; offset < countJson.count; offset += 2000) pages.push(offset)
  log(`Downloading ${countJson.count.toLocaleString()} records in ${pages.length} pages`)

  const rows = []
  const concurrency = 6
  for (let start = 0; start < pages.length; start += concurrency) {
    const batch = pages.slice(start, start + concurrency)
    const results = await Promise.all(
      batch.map(async (offset) => {
        const url = new URL(`${serviceUrl}/query`)
        url.search = new URLSearchParams({
          f: "json",
          where: "1=1",
          outFields: fields.join(","),
          returnGeometry: "false",
          orderByFields: "OBJECTID",
          resultOffset: String(offset),
          resultRecordCount: "2000",
        })
        const json = await (await fetchWithRetry(url)).json()
        if (!Array.isArray(json.features)) {
          throw new Error(`ArcGIS page ${offset} failed: ${JSON.stringify(json.error ?? json)}`)
        }
        return json.features.map(({ attributes }) => attributes)
      })
    )
    rows.push(...results.flat())
    log(`Received ${Math.min(start + concurrency, pages.length)}/${pages.length} pages`)
  }
  return rows
}

function buildSchoolLocationIndex(rows, { idField, prefix }) {
  const index = new Map()
  const byStateName = new Map()
  for (const row of rows) {
    const rawId = String(row[idField] ?? "").trim()
    const state = String(row.STATE ?? "").trim().toUpperCase()
    const point = coordinate(row.LON, row.LAT)
    if (!rawId || !STATE_CODES.has(state) || !point) continue
    const entry = {
      prefix,
      rawId,
      name: String(row.NAME ?? "").trim(),
      city: String(row.CITY ?? "").trim(),
      state,
      point,
    }
    const keys = new Set([
      territoryMatchKey(entry.name, entry.city, entry.state),
      territoryMatchKey(entry.name, entry.city, entry.state.replace(/\s+/g, "")),
      territoryMatchKey(entry.name, entry.city, entry.state),
    ])
    for (const key of keys) {
      if (!index.has(key)) index.set(key, entry)
    }
    const nameKey = normalizeSchoolName(entry.name)
    const bucket = byStateName.get(state) ?? new Map()
    const list = bucket.get(nameKey) ?? []
    list.push(entry)
    bucket.set(nameKey, list)
    byStateName.set(state, bucket)
  }
  return { index, byStateName }
}

function findSchoolMatch(teamName, city, state, publicIndex, privateIndex, publicByName, privateByName) {
  const direct =
    publicIndex.get(territoryMatchKey(teamName, city, state)) ??
    privateIndex.get(territoryMatchKey(teamName, city, state))
  if (direct) return direct

  const normalizedTeam = normalizeSchoolName(teamName)
  const cityNorm = normalizeTerritoryToken(city)
  for (const bucket of [publicByName.get(state), privateByName.get(state)]) {
    if (!bucket) continue
    const candidates = bucket.get(normalizedTeam) ?? []
    if (!candidates.length) continue
    const inCity = candidates.filter((entry) => normalizeTerritoryToken(entry.city) === cityNorm)
    if (inCity.length === 1) return inCity[0]
    if (candidates.length === 1) return candidates[0]
    const partial = candidates.filter(
      (entry) =>
        normalizeTerritoryToken(entry.city).includes(cityNorm) ||
        cityNorm.includes(normalizeTerritoryToken(entry.city))
    )
    if (partial.length === 1) return partial[0]
  }
  return null
}

function buildCityIndexes(cityRows) {
  const cityIndex = new Map()
  const cityRowsByState = new Map()
  for (const row of cityRows) {
    const state = String(row.USPS ?? "").trim().toUpperCase()
    const name = String(row.NAME ?? "").trim()
    const point = coordinate(row.INTPTLONG, row.INTPTLAT)
    const population = Number(row.POP2024 ?? row.POP2023 ?? row.POP2020 ?? row.USPOP ?? 0)
    if (!STATE_CODES.has(state) || !point || !name) continue
    const place = { name, state, point, population }
    const list = cityRowsByState.get(state) ?? []
    list.push(place)
    cityRowsByState.set(state, list)
    for (const key of new Set([territoryCityKey(name, state), territoryCityKey(name.replace(/\./g, ""), state)])) {
      const current = cityIndex.get(key)
      if (!current || population > current.population) cityIndex.set(key, place)
    }
  }
  return { cityIndex, cityRowsByState }
}

function resolveCityPoint(city, state, cityIndex, cityRowsByState) {
  const direct = cityIndex.get(territoryCityKey(city, state))
  if (direct) return direct.point

  const target = normalizeTerritoryToken(city)
  const candidates = cityRowsByState.get(state) ?? []
  let best = null
  for (const place of candidates) {
    const placeNorm = normalizeTerritoryToken(place.name)
    if (placeNorm === target) return place.point
    if (placeNorm.includes(target) || target.includes(placeNorm)) {
      if (!best || place.population > best.population) best = place
    }
  }
  return best?.point ?? null
}

function footballUnitIdsFromEada(bytes) {
  const files = unzipSync(bytes)
  const entry = Object.entries(files).find(([name]) => /schools\.xlsx$/i.test(name))
  if (!entry) throw new Error("EADA schools.xlsx not found")
  const workbook = XLSX.read(Buffer.from(entry[1]), { type: "buffer", cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" })
  const ids = new Set()
  for (const row of rows) {
    if (String(row.Sports ?? "").trim() !== "Football") continue
    const unitid = String(row.unitid ?? row.UNITID ?? "").trim()
    if (unitid) ids.add(unitid)
  }
  if (ids.size < 600) throw new Error(`Unexpected EADA football count: ${ids.size}`)
  return ids
}

function sanitizeMetro(value) {
  const metro = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!metro || metro.includes("\n") || /region/i.test(metro) || metro.length > 80) return ""
  return metro
}

function collegeFootballRows(rows, allowedUnitIds) {
  const records = []
  for (const row of rows) {
    const rawId = String(row.UNITID ?? "").trim()
    const state = String(row.STATE ?? "").trim().toUpperCase()
    const point = coordinate(row.LON, row.LAT)
    if (!rawId || !allowedUnitIds.has(rawId) || !STATE_CODES.has(state) || !point) continue
    records.push([
      `college:${rawId}`,
      String(row.NAME ?? "").trim(),
      "college",
      state,
      String(row.CITY ?? "").trim(),
      point[0],
      point[1],
      "",
    ])
  }
  return records
}

function attachMetroFromCities(records) {
  const cityMetro = new Map()
  for (const record of records) {
    const metro = sanitizeMetro(record[7])
    if (!metro) continue
    cityMetro.set(territoryCityKey(record[4], record[3]), metro)
  }
  return records.map((record) => {
    const metro = sanitizeMetro(record[7]) || cityMetro.get(territoryCityKey(record[4], record[3])) || ""
    return [...record.slice(0, 7), metro]
  })
}

function highSchoolFootballRows(
  rows,
  publicIndex,
  privateIndex,
  publicByName,
  privateByName,
  cityIndex,
  cityRowsByState
) {
  const usedCatalogIds = new Set()
  const usedHsfbIds = new Set()
  const records = []
  let matched = 0
  let unmatched = 0
  let skipped = 0

  for (const row of rows) {
    const teamName = String(row.team_name ?? "").trim()
    const city = String(row.city ?? "").trim()
    const state = String(row.state ?? "").trim().toUpperCase()
    if (!teamName || !city || !STATE_CODES.has(state)) continue

    const match = findSchoolMatch(
      teamName,
      city,
      state,
      publicIndex,
      privateIndex,
      publicByName,
      privateByName
    )

    const metro = sanitizeMetro(row.metro)

    if (match) {
      const catalogId = `${match.prefix}:${match.rawId}`
      if (!usedCatalogIds.has(catalogId)) {
        usedCatalogIds.add(catalogId)
        records.push([catalogId, teamName, "high-school", state, city, match.point[0], match.point[1], metro])
        matched++
        continue
      }
    }

    let slug =
      String(row.maxpreps_slug ?? "").trim() ||
      maxprepsSlugFromUrl(String(row.maxpreps_url ?? "")) ||
      normalizeSchoolName(teamName).replace(/\s+/g, "-")
    if (!slug) slug = `team-${records.length + 1}`
    let hsfbId = `hsfb:${slug}`
    if (usedHsfbIds.has(hsfbId)) hsfbId = `hsfb:${slug}-${state.toLowerCase()}`
    if (usedHsfbIds.has(hsfbId)) hsfbId = `hsfb:${slug}-${state.toLowerCase()}-${normalizeTerritoryToken(city).replace(/\s+/g, "-")}`

    const centroid = resolveCityPoint(city, state, cityIndex, cityRowsByState)
    if (!centroid) {
      skipped++
      continue
    }
    usedHsfbIds.add(hsfbId)
    records.push([hsfbId, teamName, "high-school", state, city, centroid[0], centroid[1], metro])
    unmatched++
  }

  if (skipped) log(`Skipped ${skipped.toLocaleString()} teams without a resolvable city centroid`)
  return { records, matched, unmatched, skipped }
}

function nflRows() {
  return NFL_TEAMS.map(([name, city, state, lon, lat]) => [
    `nfl:${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    name,
    "nfl",
    state,
    city,
    lon,
    lat,
    "",
  ])
}

function assertUnique(records, label) {
  const ids = new Set()
  for (const record of records) {
    if (ids.has(record[0])) throw new Error(`Duplicate ${label} id: ${record[0]}`)
    ids.add(record[0])
  }
}

function sorted(records) {
  return records.sort(
    (a, b) =>
      a[3].localeCompare(b[3]) ||
      a[1].localeCompare(b[1], "en", { sensitivity: "base" }) ||
      a[0].localeCompare(b[0])
  )
}

async function buildStates() {
  const topology = JSON.parse(
    await readFile(new URL("../node_modules/us-atlas/states-10m.json", import.meta.url), "utf8")
  )
  const collection = feature(topology, topology.objects.states)
  collection.features = collection.features
    .filter((item) => STATES[String(item.id).padStart(2, "0")])
    .map((item) => {
      const fips = String(item.id).padStart(2, "0")
      const [code, name] = STATES[fips]
      return { ...item, id: code, properties: { code, name, fips } }
    })
    .sort((a, b) => a.properties.code.localeCompare(b.properties.code))
  if (collection.features.length !== 51) {
    throw new Error(`Expected 51 state and DC shapes, found ${collection.features.length}`)
  }
  return collection
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  log("Loading high school football roster")
  const hsFootballRows = parse(readFileSync(HS_FOOTBALL_CSV, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })
  if (hsFootballRows.length < 14_000) {
    throw new Error(`High school football roster is unexpectedly small: ${hsFootballRows.length}`)
  }

  const [cityZip, eadaZip, populationCsv] = await Promise.all([
    cachedDownload("gazetteer-places-2025.zip", SOURCES.cities.url),
    cachedDownload("eada-2023-2024.zip", SOURCES.eadaFootball.url),
    cachedDownload("place-population-2023.csv", SOURCES.placePopulation.url),
  ])
  const populationByGeoid = placePopulationByGeoid(populationCsv)
  log(`${populationByGeoid.size.toLocaleString()} place population records`)

  const footballUnitIds = footballUnitIdsFromEada(eadaZip)
  log(`${footballUnitIds.size.toLocaleString()} college football programs in EADA`)

  const [publicLocations, privateLocations, collegeLocations] = await Promise.all([
    arcGisRows(SOURCES.publicLocations.url, ["OBJECTID", "NCESSCH", "NAME", "CITY", "STATE", "LAT", "LON"]),
    arcGisRows(SOURCES.privateLocations.url, ["OBJECTID", "PPIN", "NAME", "CITY", "STATE", "LAT", "LON"]),
    arcGisRows(SOURCES.colleges.url, ["OBJECTID", "UNITID", "NAME", "CITY", "STATE", "LAT", "LON"]),
  ])

  const publicSchool = buildSchoolLocationIndex(publicLocations, { idField: "NCESSCH", prefix: "public" })
  const privateSchool = buildSchoolLocationIndex(privateLocations, { idField: "PPIN", prefix: "private" })

  log("Parsing Census places")
  const cityRows = csvFromZip(cityZip, /\.txt$/i, { delimiter: "|" })
  const { cityIndex, cityRowsByState } = buildCityIndexes(cityRows)

  const { records: highSchools, matched, unmatched, skipped } = highSchoolFootballRows(
    hsFootballRows,
    publicSchool.index,
    privateSchool.index,
    publicSchool.byStateName,
    privateSchool.byStateName,
    cityIndex,
    cityRowsByState
  )
  log(`${highSchools.length.toLocaleString()} HS football teams (${matched.toLocaleString()} matched NCES, ${unmatched.toLocaleString()} hsfb)`)

  const colleges = collegeFootballRows(collegeLocations, footballUnitIds)
  const institutions = sorted(attachMetroFromCities([...highSchools, ...colleges, ...nflRows()]))

  const cities = sorted(
    cityRows.flatMap((row) => {
      const state = String(row.USPS ?? "").trim().toUpperCase()
      const point = coordinate(row.INTPTLONG, row.INTPTLAT)
      const geoid = String(row.GEOID).trim()
      const population = populationByGeoid.get(geoid) ?? 0
      if (!STATE_CODES.has(state) || !point) return []
      return [
        [
          `place:${geoid}`,
          displayPlaceName(row.NAME),
          "city",
          state,
          point[0],
          point[1],
          population,
        ],
      ]
    })
  )
  const majorCities = cities.filter((row) => row[6] >= 50_000).length

  assertUnique(institutions, "institution")
  assertUnique(cities, "city")
  if (highSchools.length < 13_000) {
    throw new Error(`High school football count is unexpectedly low: ${highSchools.length} (skipped ${skipped})`)
  }
  if (institutions.length < 13_500) throw new Error(`Institution count is unexpectedly low: ${institutions.length}`)
  if (cities.length < 25_000) throw new Error(`City count is unexpectedly low: ${cities.length}`)

  const counts = {
    highSchools: institutions.filter((row) => row[2] === "high-school").length,
    colleges: institutions.filter((row) => row[2] === "college").length,
    nflTeams: institutions.filter((row) => row[2] === "nfl").length,
    cities: cities.length,
    majorCities,
    statesAndDc: 51,
    highSchoolFootballMatched: matched,
    highSchoolFootballUnmatched: unmatched,
    highSchoolFootballSkipped: skipped,
  }
  if (counts.nflTeams !== 32) throw new Error(`Expected 32 NFL teams, found ${counts.nflTeams}`)

  const states = await buildStates()
  const payloads = {
    "institutions.json": {
      version: VERSION,
      columns: ["id", "name", "kind", "state", "city", "lon", "lat", "metro"],
      records: institutions,
    },
    "cities.json": {
      version: VERSION,
      columns: ["id", "name", "kind", "state", "lon", "lat", "population"],
      records: cities,
    },
    "states.geojson": states,
    "manifest.json": { version: VERSION, counts, sources: SOURCES },
  }

  for (const [name, payload] of Object.entries(payloads)) {
    await writeFile(new URL(name, OUTPUT_DIR), `${JSON.stringify(payload)}\n`)
    log(`Wrote ${name}`)
  }
  log(`Done: ${JSON.stringify(counts)}`)
}

await main()
