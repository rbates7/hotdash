#!/usr/bin/env node
/**
 * Pin high school teams that the map only knows by their city (all sitting on
 * the city-center point) or that sit far from their city, to the school's
 * real location, and drops teams from a metro they sit far outside of.
 *
 *   node scripts/pin-sales-map-locations.mjs --addresses <file.json> --nces <dir>
 *   node scripts/pin-sales-map-locations.mjs --apply
 *
 * --apply      Reapply scripts/sales-map-pins.json (and the metro
 *              rule) to a freshly built institutions.json. Needs no inputs;
 *              `pnpm sales-map:refresh` runs it after the build.
 * --addresses  JSON array of { school, street, city, state, zip }: a school
 *              address list (the founder's coaching-directory export, reduced
 *              to schools and addresses). People's names, emails and phones
 *              must never be in it, and the file is not committed.
 * --nces       Folder holding public.json and private.json: the NCES public
 *              and private school location rows (NCESSCH/PPIN, NAME, STREET,
 *              CITY, STATE, ZIP, LAT, LON) from the services listed in
 *              scripts/build-sales-map-data.mjs.
 * --geocoded   Optional JSON { "<team id>": [lon, lat] }: school addresses
 *              geocoded by the US Census batch geocoder
 *              (geocoding.geo.census.gov, benchmark Public_AR_Current) for
 *              teams steps 1-2 could not place.
 *
 * How a team gets pinned, most certain first:
 *   1. Find the team in the address list (same state, same city, team name
 *      inside the school name), then find that address in NCES (same ZIP and
 *      street, or same ZIP and house number): NCES's coordinates.
 *   2. No address match: an NCES school with the team's name in the same
 *      city that looks like a high school.
 *   3. The team's school address, geocoded by the Census (--geocoded).
 * A pin more than 60 km from the team's city is refused, and so is a school
 * already used by another team. Ids never change, so deals stay linked.
 *
 * Writes public/data/sales-map/institutions.json and manifest.json, and
 * scripts/sales-map-pins.json (id -> [lon, lat, how]) so the next
 * full build (`pnpm sales-map:refresh`) can apply the same pins.
 */
import { readFile, writeFile } from "node:fs/promises"
import { parseArgs } from "node:util"

const { values: args } = parseArgs({
  options: {
    addresses: { type: "string" },
    nces: { type: "string" },
    geocoded: { type: "string" },
    apply: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
})
if (!args.apply && (!args.addresses || !args.nces)) {
  console.error(
    "Usage: node scripts/pin-sales-map-locations.mjs --addresses <file.json> --nces <dir> [--dry-run]\n" +
      "       node scripts/pin-sales-map-locations.mjs --apply"
  )
  process.exit(1)
}

const ROOT = new URL("../", import.meta.url)
const INSTITUTIONS = new URL("public/data/sales-map/institutions.json", ROOT)
const CITIES = new URL("public/data/sales-map/cities.json", ROOT)
const MANIFEST = new URL("public/data/sales-map/manifest.json", ROOT)
const PINS = new URL("scripts/sales-map-pins.json", ROOT)

const MAX_PIN_KM = 60
const FAR_KM = 40

/* ------------------------------------------------------------ normalizing */

const WORD_ALIASES = {
  st: "saint", ste: "saint", mt: "mount", ft: "fort", pt: "point",
  tech: "technical", acad: "academy", prep: "preparatory", chr: "christian",
  cath: "catholic", sr: "senior", jr: "junior", intl: "international",
  n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
  hts: "heights", spgs: "springs", spg: "springs", lk: "lake", vly: "valley", co: "county", cty: "county",
}
/** Words that say "a school" rather than which one. */
const FILLER = new Set([
  "high", "school", "schools", "hs", "h", "senior", "the", "of", "and", "at", "secondary", "campus",
  "sr", "jr", "jr/sr", "middle/high", "jshs", "shs", "ihs", "chs", "academy", "preparatory",
])
/** NCES names that are not a high school. */
const NOT_HIGH_SCHOOL = /\b(el|elem|elementary|middle|ms|intermediate|primary|kindergarten|pre ?k|early|daep|jjaep|juvenile|detention)\b/

function plain(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function words(value) {
  return plain(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => WORD_ALIASES[word] ?? word)
}

/** The words that identify a school: "R. L. Paschal High School" -> ["r","l","paschal"]. */
function nameTokens(value) {
  return words(value).filter((word) => !FILLER.has(word))
}

function cityKey(city, state) {
  let value = words(city).join(" ")
  for (const suffix of [" city", " town", " village"]) if (value.endsWith(suffix)) value = value.slice(0, -suffix.length)
  return `${state}|${value}`
}

const STREET_ALIASES = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", boulevard: "blvd", highway: "hwy",
  lane: "ln", parkway: "pkwy", place: "pl", court: "ct", circle: "cir", terrace: "ter", trail: "trl",
  freeway: "fwy", expressway: "expy", route: "rte", north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw", suite: "", ste: "",
}
function streetKey(street) {
  return plain(street)
    .split(" ")
    .map((word) => STREET_ALIASES[word] ?? word)
    .filter(Boolean)
    .join(" ")
}
function houseNumber(street) {
  return plain(street).match(/^\d+/)?.[0] ?? ""
}

function km([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return 6371 * Math.hypot(x, y)
}

/** Every identifying word of the team appears in the school's name. */
function nameFits(teamTokens, schoolTokens) {
  if (!teamTokens.length) return false
  const school = new Set(schoolTokens)
  return teamTokens.every((token) => school.has(token))
}

/* ------------------------------------------------------------------- load */

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const institutions = await readJson(INSTITUTIONS)
const cities = await readJson(CITIES)
const savedPins = args.apply ? await readJson(PINS) : null
const addresses = args.apply ? [] : await readJson(args.addresses)
const geocoded = args.geocoded ? await readJson(args.geocoded) : {}
const ncesRows = args.apply
  ? []
  : [
      ...(await readJson(`${args.nces}/public.json`)).map((row) => ({ ...row, id: `public:${row.NCESSCH}` })),
      ...(await readJson(`${args.nces}/private.json`)).map((row) => ({ ...row, id: `private:${row.PPIN}` })),
    ]

for (const entry of addresses) {
  for (const key of Object.keys(entry)) {
    if (!["school", "street", "city", "state", "zip", "football"].includes(key)) {
      throw new Error(`Address list has a "${key}" field; keep it to school and address only.`)
    }
  }
}

const cityCenter = new Map()
for (const [, name, , state, lon, lat, population] of cities.records) {
  const key = cityKey(name, state)
  const current = cityCenter.get(key)
  if (!current || (population ?? 0) > current.population) cityCenter.set(key, { point: [lon, lat], population: population ?? 0 })
}

const nces = ncesRows
  .filter((row) => Number.isFinite(row.LAT) && Number.isFinite(row.LON))
  .map((row) => ({
    id: row.id,
    name: String(row.NAME ?? ""),
    tokens: nameTokens(row.NAME),
    highSchool: !NOT_HIGH_SCHOOL.test(plain(row.NAME)),
    street: streetKey(row.STREET),
    number: houseNumber(row.STREET),
    city: cityKey(row.CITY, String(row.STATE ?? "").toUpperCase()),
    zip: String(row.ZIP ?? "").slice(0, 5),
    point: [Number(row.LON.toFixed(5)), Number(row.LAT.toFixed(5))],
  }))
const ncesByZip = new Map()
const ncesByCity = new Map()
for (const school of nces) {
  for (const [index, key] of [[ncesByZip, school.zip], [ncesByCity, school.city]]) {
    const list = index.get(key)
    if (list) list.push(school)
    else index.set(key, [school])
  }
}

/** An address from the list, located through NCES. */
function locateAddress(entry) {
  const candidates = ncesByZip.get(String(entry.zip).slice(0, 5)) ?? []
  const street = streetKey(entry.street)
  const number = houseNumber(entry.street)
  const tokens = nameTokens(entry.school)
  const byStreet = candidates.filter((school) => school.street === street)
  const pick = (list) => {
    if (list.length === 1) return list[0]
    const named = list.filter((school) => tokens.some((token) => school.tokens.includes(token)))
    if (named.length === 1) return named[0]
    const high = list.filter((school) => school.highSchool)
    return high.length === 1 ? high[0] : null
  }
  return (
    (byStreet.length && pick(byStreet)) ||
    (number && pick(candidates.filter((school) => school.number === number))) ||
    pick(candidates.filter((school) => nameFits(tokens, school.tokens))) ||
    null
  )
}

const addressByCity = new Map()
for (const entry of addresses) {
  const key = cityKey(entry.city, String(entry.state).toUpperCase())
  const item = { ...entry, tokens: nameTokens(entry.school) }
  const list = addressByCity.get(key)
  if (list) list.push(item)
  else addressByCity.set(key, [item])
}

/* ----------------------------------------------------- which teams to pin */

const records = institutions.records
const spotCount = new Map()
for (const record of records) {
  const key = `${record[5].toFixed(4)}|${record[6].toFixed(4)}`
  spotCount.set(key, (spotCount.get(key) ?? 0) + 1)
}
const isStacked = (record) => (spotCount.get(`${record[5].toFixed(4)}|${record[6].toFixed(4)}`) ?? 0) > 1
const centerOf = (record) => cityCenter.get(cityKey(record[4], record[3]))?.point ?? null
const isFar = (record) => {
  const center = centerOf(record)
  return Boolean(center && km(center, [record[5], record[6]]) > FAR_KM)
}

// Schools already standing for a team keep it: a pin never reuses one.
const used = new Set(records.filter((record) => !record[0].startsWith("hsfb:")).map((record) => record[0]))

function unique(list) {
  if (list.length === 1) return list[0]
  // Same school listed twice (e.g. "Trimble Technical School" and "... High School").
  const spots = new Set(list.map((item) => item.point?.join(",")))
  return spots.size === 1 ? list[0] : null
}

function pinFor(record) {
  const [, name, , state, city] = record
  const tokens = nameTokens(name)
  const center = centerOf(record)
  const accept = (school, how) => {
    if (!school || used.has(school.id)) return null
    if (center && km(center, school.point) > MAX_PIN_KM) return null
    return { point: school.point, how, schoolId: school.id }
  }

  // 1. The address list, then NCES by address.
  const listed = (addressByCity.get(cityKey(city, state)) ?? []).filter((entry) => nameFits(tokens, entry.tokens))
  const preferred = listed.filter((entry) => entry.football)
  for (const group of [preferred, listed]) {
    const located = group.map((entry) => ({ ...entry, school: locateAddress(entry) })).filter((entry) => entry.school)
    const choice = unique(located.map((entry) => ({ ...entry, point: entry.school.point })))
    const pin = choice && accept(choice.school, "address")
    if (pin) return pin
  }

  // 2. NCES by name in the same city.
  const named = (ncesByCity.get(cityKey(city, state)) ?? []).filter(
    (school) => school.highSchool && nameFits(tokens, school.tokens)
  )
  const choice = unique(named)
  const byName = accept(choice, "name")
  if (byName) return byName

  // 3. The school's address, geocoded by the Census.
  const point = geocoded[record[0]]
  return point ? accept({ id: `census:${point.join(",")}`, point }, "census") : null
}

/* -------------------------------------------------------------------- run */

const pins = {}
const tally = { stacked: 0, far: 0, pinned: 0, address: 0, name: 0, census: 0 }
const updated = records.map((record) => {
  if (record[2] !== "high-school") return record
  if (savedPins) {
    const saved = savedPins[record[0]]
    if (!saved) return record
    tally.pinned += 1
    tally[saved[2]] = (tally[saved[2]] ?? 0) + 1
    pins[record[0]] = saved
    return [...record.slice(0, 5), saved[0], saved[1], record[7]]
  }
  const stacked = isStacked(record)
  const far = isFar(record)
  const centroid = record[0].startsWith("hsfb:")
  if (!stacked && !far && !centroid) return record
  if (stacked) tally.stacked += 1
  if (far) tally.far += 1
  const pin = pinFor(record)
  if (!pin) return record
  used.add(pin.schoolId)
  tally.pinned += 1
  tally[pin.how] += 1
  pins[record[0]] = [pin.point[0], pin.point[1], pin.how]
  return [record[0], record[1], record[2], record[3], record[4], pin.point[0], pin.point[1], record[7]]
})

/* ------------------------------------------------------------------ metros */

// Metro names are media-market style ("Hartford & New Haven", "Wilson
// Area"), not federal metro areas, so they are kept as they are. A team
// leaves its metro only when it sits more than METRO_KM from the metro's
// center (the median of its teams), so "Dallas" stops reaching Clarksville.
const METRO_KM = 80
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
const members = new Map()
for (const record of updated) {
  if (!record[7] || record[2] === "nfl") continue
  const key = `${record[3]}|${record[7]}`
  const list = members.get(key)
  if (list) list.push(record)
  else members.set(key, [record])
}
const metroCenter = new Map(
  [...members].map(([key, list]) => [key, [median(list.map((r) => r[5])), median(list.map((r) => r[6]))]])
)
const metroTally = { dropped: 0 }
const final = updated.map((record) => {
  const base = record.slice(0, 8)
  if (!base[7] || base[2] === "nfl") return base
  const center = metroCenter.get(`${base[3]}|${base[7]}`)
  if (center && km(center, [base[5], base[6]]) <= METRO_KM) return base
  metroTally.dropped += 1
  return [...base.slice(0, 7), ""]
})

/* ------------------------------------------------------------------ report */

const stillStacked = (() => {
  const counts = new Map()
  for (const record of final) {
    if (record[2] !== "high-school") continue
    const key = `${record[5].toFixed(4)}|${record[6].toFixed(4)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0)
})()
const stillFar = final.filter((record) => record[2] === "high-school" && isFar(record)).length
const dallas = (list) => list.filter((record) => record[3] === "TX" && record[7] === "Dallas").length
console.log(
  JSON.stringify(
    {
      highSchoolTeams: records.filter((record) => record[2] === "high-school").length,
      checked: { stackedOnOnePoint: tally.stacked, farFromCity: tally.far },
      pinned: { total: tally.pinned, byAddress: tally.address, byName: tally.name, byCensus: tally.census },
      after: { stillStackedOnOnePoint: stillStacked, stillFarFromCity: stillFar },
      metros: { ...metroTally, dallasTeamsBefore: dallas(records), dallasTeamsAfter: dallas(final) },
    },
    null,
    2
  )
)

if (args["dry-run"]) process.exit(0)

await writeFile(INSTITUTIONS, JSON.stringify({ ...institutions, records: final }))
const manifest = await readJson(MANIFEST)
manifest.counts.highSchoolFootballPinned = tally.pinned
manifest.counts.highSchoolFootballStackedAfterPinning = stillStacked
manifest.sources.pinnedLocations = {
  note: "High school teams without an exact location, pinned via a school address list matched to NCES school locations; teams over 80 km from their metro's center leave it. See scripts/pin-sales-map-locations.mjs.",
  file: "scripts/sales-map-pins.json",
}
await writeFile(MANIFEST, JSON.stringify(manifest))
if (args.apply) process.exit(0)
await writeFile(PINS, `${JSON.stringify(pins, null, 0).replaceAll('],"', '],\n"')}\n`)
console.log(`Wrote ${Object.keys(pins).length.toLocaleString()} pins.`)
