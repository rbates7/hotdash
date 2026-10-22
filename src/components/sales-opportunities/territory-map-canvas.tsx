"use client"

import * as React from "react"
import { geoAlbersUsa, geoContains, geoMercator, geoPath, type GeoProjection } from "d3-geo"
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson"
import { ArrowLeftIcon, LoaderCircleIcon, MapPinIcon, SearchIcon } from "lucide-react"

import {
  cityPopulation,
  institutionMetro,
  institutionRecordsBounds,
  isMajorCity,
  opportunityStatus,
  paddedInstitutionBounds,
  pointInBounds,
  spreadScreenPoints,
  territoryCityKey,
  territoryMetroKey,
  type CityRecord,
  type InstitutionKind,
  type InstitutionRecord,
} from "@/lib/sales-map"
import { cn } from "@/lib/utils"
import { useDeals } from "@/components/sales-opportunities/deals-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type StateProperties = { code: string; name: string; fips: string }
type StateFeature = Feature<Geometry, StateProperties>
type States = FeatureCollection<Geometry, StateProperties>
type InstitutionPayload = { version: number; records: InstitutionRecord[] }
type CityPayload = { version: number; records: CityRecord[] }
type Manifest = {
  version: number
  counts: {
    highSchools: number
    colleges: number
    nflTeams: number
    cities: number
    majorCities?: number
    statesAndDc: number
  }
}

type CityWithTeams = { key: string; name: string; state: string; teamCount: number }
type MetroWithTeams = { key: string; name: string; state: string; teamCount: number }

const KIND_LABEL: Record<InstitutionKind, string> = {
  "high-school": "High school teams",
  college: "College football",
  nfl: "NFL teams",
}

const KIND_SHORT: Record<InstitutionKind, string> = {
  "high-school": "High school team",
  college: "College football",
  nfl: "NFL team",
}

const STATUS_COLOR = {
  customer: "#16884f",
  engaged: "#d9a700",
  available: "#9aa29d",
} as const

/** Match Sales Opportunities: 44px tap targets below desktop (1280). */
const MAP_TAP = "max-xl:min-h-11"
const MAP_KIND =
  "border-input rounded-full border px-2.5 py-1.5 text-xs font-medium max-xl:min-h-11 max-xl:px-3 max-xl:py-2 max-xl:text-sm"
const MAP_LIST_BTN =
  "hover:bg-muted focus-visible:ring-ring/50 flex w-full rounded-lg px-2 text-left focus-visible:ring-[3px] focus-visible:outline-none max-xl:min-h-11 max-xl:items-center max-xl:py-2"

function loadJson<T>(path: string, signal: AbortSignal): Promise<T> {
  return fetch(path, { signal }).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return response.json() as Promise<T>
  })
}

function useCanvasSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function boundsFeature(bounds: [[number, number], [number, number]]): Feature<Polygon> {
  const [[west, south], [east, north]] = bounds
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    },
  }
}

function projectionFor(
  width: number,
  height: number,
  states: States,
  selected: StateFeature | undefined,
  focusBounds: [[number, number], [number, number]] | null
): GeoProjection {
  const extent: [[number, number], [number, number]] = [[24, 24], [width - 24, height - 24]]
  if (focusBounds) return geoMercator().fitExtent(extent, boundsFeature(focusBounds))
  return selected ? geoMercator().fitExtent(extent, selected) : geoAlbersUsa().fitExtent(extent, states)
}

function metrosWithTeamsFrom(records: InstitutionRecord[]): MetroWithTeams[] {
  const grouped = new Map<string, MetroWithTeams>()
  for (const record of records) {
    const metro = institutionMetro(record)
    if (!metro) continue
    const key = territoryMetroKey(metro, record[3])
    const current = grouped.get(key)
    if (current) current.teamCount += 1
    else grouped.set(key, { key, name: metro, state: record[3], teamCount: 1 })
  }
  return [...grouped.values()].sort((a, b) => b.teamCount - a.teamCount || a.name.localeCompare(b.name))
}

function citiesWithTeamsFrom(records: InstitutionRecord[]): CityWithTeams[] {
  const grouped = new Map<string, CityWithTeams>()
  for (const record of records) {
    const key = territoryCityKey(record[4], record[3])
    const current = grouped.get(key)
    if (current) current.teamCount += 1
    else grouped.set(key, { key, name: record[4], state: record[3], teamCount: 1 })
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
}

function navigationCitiesFrom(majorCities: CityRecord[], withTeams: CityWithTeams[]): CityWithTeams[] {
  const grouped = new Map<string, CityWithTeams>()
  for (const city of withTeams) grouped.set(city.key, city)
  for (const city of majorCities) {
    const key = territoryCityKey(city[1], city[3])
    if (!grouped.has(key)) grouped.set(key, { key, name: city[1], state: city[3], teamCount: 0 })
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
}

function shouldLabelCity(
  city: CityRecord,
  selectedState: string,
  selectedMetro: string,
  selectedCity: string
): boolean {
  const pop = cityPopulation(city)
  if (selectedCity) return territoryCityKey(city[1], city[3]) === territoryCityKey(selectedCity, selectedState)
  if (selectedMetro) return pop >= 25_000
  if (selectedState) return pop >= 75_000
  return pop >= 250_000
}

export function TerritoryMap() {
  const { deals } = useDeals()
  const frameRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const projectionRef = React.useRef<GeoProjection | null>(null)
  const layoutRef = React.useRef<Map<string, [number, number]>>(new Map())
  const size = useCanvasSize(frameRef)
  const [institutions, setInstitutions] = React.useState<InstitutionRecord[]>([])
  const [cities, setCities] = React.useState<CityRecord[]>([])
  const [states, setStates] = React.useState<States | null>(null)
  const [manifest, setManifest] = React.useState<Manifest | null>(null)
  const [error, setError] = React.useState("")
  const [selectedState, setSelectedState] = React.useState("")
  const [selectedMetro, setSelectedMetro] = React.useState("")
  const [selectedCity, setSelectedCity] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [highlightedId, setHighlightedId] = React.useState("")
  const [kinds, setKinds] = React.useState<Set<InstitutionKind>>(
    () => new Set(["high-school", "college", "nfl"])
  )

  React.useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      loadJson<InstitutionPayload>("/data/sales-map/institutions.json", controller.signal),
      loadJson<CityPayload>("/data/sales-map/cities.json", controller.signal),
      loadJson<States>("/data/sales-map/states.geojson", controller.signal),
      loadJson<Manifest>("/data/sales-map/manifest.json", controller.signal),
    ])
      .then(([institutionData, cityData, stateData, manifestData]) => {
        setInstitutions(institutionData.records)
        setCities(cityData.records)
        setStates(stateData)
        setManifest(manifestData)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Map data could not be loaded")
      })
    return () => controller.abort()
  }, [])

  const selectedFeature = React.useMemo(
    () => states?.features.find((item) => item.properties.code === selectedState),
    [selectedState, states]
  )
  const statuses = React.useMemo(() => opportunityStatus(deals), [deals])
  const stateInstitutions = React.useMemo(
    () => institutions.filter((item) => (!selectedState || item[3] === selectedState) && kinds.has(item[2])),
    [institutions, kinds, selectedState]
  )
  const metrosWithTeams = React.useMemo(() => metrosWithTeamsFrom(stateInstitutions), [stateInstitutions])
  const metroInstitutions = React.useMemo(() => {
    if (!selectedMetro) return stateInstitutions
    const metroKey = territoryMetroKey(selectedMetro, selectedState)
    return stateInstitutions.filter((item) => territoryMetroKey(institutionMetro(item), item[3]) === metroKey)
  }, [selectedMetro, selectedState, stateInstitutions])
  const visibleInstitutions = React.useMemo(() => {
    const scoped = selectedMetro ? metroInstitutions : stateInstitutions
    if (!selectedCity) return scoped
    const cityKey = territoryCityKey(selectedCity, selectedState)
    return scoped.filter((item) => territoryCityKey(item[4], item[3]) === cityKey)
  }, [metroInstitutions, selectedCity, selectedMetro, selectedState, stateInstitutions])
  const citiesWithTeams = React.useMemo(
    () => citiesWithTeamsFrom(selectedMetro ? metroInstitutions : stateInstitutions),
    [metroInstitutions, selectedMetro, stateInstitutions]
  )
  const stateMajorCities = React.useMemo(
    () => (selectedState ? cities.filter((city) => city[3] === selectedState && isMajorCity(city)) : []),
    [cities, selectedState]
  )
  const focusBounds = React.useMemo(() => {
    if (!selectedCity && !selectedMetro) return null
    const bounds = institutionRecordsBounds(visibleInstitutions)
    if (bounds) {
      return paddedInstitutionBounds(bounds, {
        padding: selectedCity ? 0.22 : 0.12,
        minSpan: selectedCity ? 0.04 : 0.07,
      })
    }
    if (selectedCity) {
      const place = stateMajorCities.find(
        (city) => territoryCityKey(city[1], city[3]) === territoryCityKey(selectedCity, selectedState)
      )
      if (!place) return null
      return paddedInstitutionBounds([[place[4], place[5]], [place[4], place[5]]], { padding: 0.25, minSpan: 0.05 })
    }
    return null
  }, [selectedCity, selectedMetro, selectedState, stateMajorCities, visibleInstitutions])
  const visibleMajorCities = React.useMemo(() => {
    if (!selectedState) return cities.filter((city) => cityPopulation(city) >= 250_000)
    let scoped = stateMajorCities
    if (focusBounds && (selectedMetro || selectedCity)) {
      scoped = scoped.filter((city) => pointInBounds(city[4], city[5], focusBounds))
    }
    return scoped
  }, [cities, focusBounds, selectedCity, selectedMetro, selectedState, stateMajorCities])
  const navigationCities = React.useMemo(
    () => navigationCitiesFrom(stateMajorCities, citiesWithTeams),
    [citiesWithTeams, stateMajorCities]
  )

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !states || !size.width || !size.height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    const context = canvas.getContext("2d")
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, size.width, size.height)
    context.fillStyle = "#f6f7f4"
    context.fillRect(0, 0, size.width, size.height)

    const projection = projectionFor(size.width, size.height, states, selectedFeature, focusBounds)
    projectionRef.current = projection
    const path = geoPath(projection, context)
    const zoomed = Boolean(selectedFeature)

    for (const state of selectedFeature ? [selectedFeature] : states.features) {
      context.beginPath()
      path(state)
      context.fillStyle = "#ffffff"
      context.fill()
      context.strokeStyle = "#66756c"
      context.lineWidth = zoomed ? 1.8 : 0.85
      context.stroke()
    }

    if (zoomed || !selectedState) {
      for (const city of visibleMajorCities) {
        const point = projection([city[4], city[5]])
        if (!point) continue
        context.beginPath()
        context.arc(point[0], point[1], selectedCity ? 3.2 : 2.4, 0, Math.PI * 2)
        context.fillStyle = "#dfe5e0"
        context.fill()
        context.strokeStyle = "#7a8a82"
        context.lineWidth = 1
        context.stroke()
        if (shouldLabelCity(city, selectedState, selectedMetro, selectedCity)) {
          context.font = "600 11px system-ui, sans-serif"
          context.fillStyle = "#334155"
          context.fillText(city[1], point[0] + 5, point[1] - 5)
        }
      }
    }

    const spreadRadius = selectedCity ? 16 : selectedMetro ? 12 : 0
    const layout =
      spreadRadius > 0
        ? spreadScreenPoints(visibleInstitutions, (lon, lat) => projection([lon, lat]), spreadRadius)
        : new Map(
            visibleInstitutions.flatMap((item) => {
              const point = projection([item[5], item[6]])
              return point ? [[item[0], point] as const] : []
            })
          )
    layoutRef.current = layout

    const drawOrder = [...visibleInstitutions].sort((a, b) => {
      if (a[0] === highlightedId) return 1
      if (b[0] === highlightedId) return -1
      return 0
    })

    for (const item of drawOrder) {
      const point = layout.get(item[0])
      if (!point) continue
      const status = statuses.get(item[0]) ?? "available"
      const radius = selectedCity
        ? (item[2] === "nfl" ? 6 : 4.2)
        : selectedMetro
          ? (item[2] === "nfl" ? 5 : 3.4)
          : zoomed
            ? (item[2] === "nfl" ? 4.2 : 2.5)
            : (item[2] === "nfl" ? 2.8 : 1.35)
      context.beginPath()
      context.arc(point[0], point[1], radius, 0, Math.PI * 2)
      context.fillStyle = STATUS_COLOR[status]
      context.globalAlpha = zoomed ? 0.95 : 0.66
      context.fill()
      if (zoomed) {
        context.strokeStyle = "#ffffff"
        context.lineWidth = 1.2
        context.stroke()
      }
      context.globalAlpha = 1
      if (item[0] === highlightedId) {
        context.beginPath()
        context.arc(point[0], point[1], radius + 5, 0, Math.PI * 2)
        context.strokeStyle = "#2563eb"
        context.lineWidth = 2.5
        context.stroke()
      }
    }
  }, [
    focusBounds,
    highlightedId,
    selectedCity,
    selectedFeature,
    selectedMetro,
    selectedState,
    size,
    states,
    statuses,
    visibleInstitutions,
    visibleMajorCities,
  ])

  const stateOptions = React.useMemo(
    () => states?.features.map((item) => item.properties).sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [states]
  )
  const selectedName = stateOptions.find((state) => state.code === selectedState)?.name
  const territoryTitle = selectedCity && selectedName
    ? `${selectedCity}, ${selectedName} territory`
    : selectedMetro && selectedName
      ? `${selectedMetro} area, ${selectedName} territory`
      : selectedName
        ? `${selectedName} territory`
        : "United States territory"
  const nationwideTeams = manifest
    ? manifest.counts.highSchools + manifest.counts.colleges + manifest.counts.nflTeams
    : 0
  const subtitle = selectedCity
    ? `${visibleInstitutions.length.toLocaleString()} teams in ${selectedCity}`
    : selectedMetro
      ? `${visibleInstitutions.length.toLocaleString()} teams in the ${selectedMetro} area · ${citiesWithTeams.length.toLocaleString()} cities`
      : selectedState
        ? `${metrosWithTeams.length.toLocaleString()} metro areas · ${citiesWithTeams.length.toLocaleString()} cities · ${stateInstitutions.length.toLocaleString()} teams`
      : manifest
        ? `${nationwideTeams.toLocaleString()} football teams nationwide`
        : "Loading high school, college, and NFL teams"
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const results = React.useMemo(() => {
    if (!normalizedQuery) return []
    const institutionMatches = stateInstitutions
      .filter((item) => `${item[1]} ${item[4]} ${item[3]}`.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 10)
      .map((item) => ({ type: "institution" as const, item }))
    let room = Math.max(0, 12 - institutionMatches.length)
    const metroMatches = metrosWithTeams
      .filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, room)
      .map((item) => ({ type: "metro" as const, item }))
    room = Math.max(0, room - metroMatches.length)
    const cityMatches = navigationCities
      .filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, room)
      .map((item) => ({ type: "city" as const, item }))
    return [...institutionMatches, ...metroMatches, ...cityMatches]
  }, [metrosWithTeams, navigationCities, normalizedQuery, stateInstitutions])
  const highlighted = institutions.find((item) => item[0] === highlightedId)

  const resetCity = () => {
    setSelectedCity("")
    setHighlightedId("")
  }

  const resetMetro = () => {
    setSelectedMetro("")
    setSelectedCity("")
    setHighlightedId("")
  }

  const resetState = () => {
    setSelectedState("")
    setSelectedMetro("")
    setSelectedCity("")
    setQuery("")
    setHighlightedId("")
  }

  const toggleKind = (kind: InstitutionKind) => {
    setKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }

  const pickFromCanvas = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const projection = projectionRef.current
    if (!projection || !states) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    if (!selectedState) {
      const coordinate = projection.invert?.(point)
      const state = coordinate && states.features.find((item) => geoContains(item, coordinate))
      if (state) {
        setSelectedState(state.properties.code)
        setSelectedMetro("")
        setSelectedCity("")
        setQuery("")
        setHighlightedId("")
      }
      return
    }

    const hitRadius = selectedCity ? 16 : selectedMetro ? 14 : 10
    let closestTeam = { id: "", distance: hitRadius }
    for (const item of visibleInstitutions) {
      const projected = layoutRef.current.get(item[0]) ?? projection([item[5], item[6]])
      if (!projected) continue
      const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1])
      if (distance < closestTeam.distance) closestTeam = { id: item[0], distance }
    }
    if (closestTeam.id) {
      setHighlightedId(closestTeam.id)
      return
    }

    let closestCity = { name: "", distance: 12 }
    for (const city of visibleMajorCities) {
      const projected = projection([city[4], city[5]])
      if (!projected) continue
      const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1])
      if (distance < closestCity.distance) closestCity = { name: city[1], distance }
    }
    if (closestCity.name) {
      setSelectedCity(closestCity.name)
      setHighlightedId("")
    }
  }

  return (
    <section aria-labelledby="territory-map-title" className="bg-surface border-surface-border overflow-hidden rounded-xl border">
      <div className="flex flex-col gap-3 border-b border-[var(--surface-border)] p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          {(selectedState || selectedMetro || selectedCity) && (
            <Button
              variant="ghost"
              size="icon"
              className="max-xl:size-11"
              aria-label={
                selectedCity
                  ? selectedMetro
                    ? `Back to ${selectedMetro} area`
                    : `Back to ${selectedName}`
                  : selectedMetro
                    ? `Back to ${selectedName}`
                    : "Back to United States"
              }
              onClick={() => {
                if (selectedCity) resetCity()
                else if (selectedMetro) resetMetro()
                else resetState()
              }}
            >
              <ArrowLeftIcon aria-hidden />
            </Button>
          )}
          <div>
            <h2 id="territory-map-title" className="text-body font-semibold tracking-tight">
              {territoryTitle}
            </h2>
            <p className="text-caption text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#16884f]" />Customer</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#d9a700]" />Engaged</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#9aa29d]" />Not a customer</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border border-[#7a8a82] bg-[#dfe5e0]" />Major city</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div ref={frameRef} className="relative h-[420px] bg-[#f6f7f4] lg:h-[560px]">
          <canvas
            ref={canvasRef}
            aria-label="Interactive United States sales map"
            onClick={pickFromCanvas}
            className="block size-full cursor-pointer"
          />
          {!states && !error && (
            <div className="absolute inset-0 grid place-items-center text-sm text-slate-600">
              <span className="inline-flex items-center gap-2"><LoaderCircleIcon className="size-4 animate-spin" />Loading territory map</span>
            </div>
          )}
          {error && (
            <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-700">
              Territory map data could not be loaded. {error}
            </div>
          )}
          {highlighted && (
            <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-900 shadow">
              <strong>{highlighted[1]}</strong>
              <span className="ml-1.5 text-slate-600">
                {`${KIND_SHORT[highlighted[2]]} · ${highlighted[4]}, ${highlighted[3]}`}
              </span>
            </div>
          )}
        </div>

        <aside aria-label="Map search and filters" className="border-t border-[var(--surface-border)] p-4 lg:border-t-0 lg:border-l">
          <label className="text-caption font-medium" htmlFor="territory-state">State</label>
          <select
            id="territory-state"
            value={selectedState}
            onChange={(event) => {
              setSelectedState(event.target.value)
              setSelectedMetro("")
              setSelectedCity("")
              setQuery("")
              setHighlightedId("")
            }}
            className={cn("border-input bg-surface mt-1.5 h-10 w-full rounded-md border px-3 text-sm", MAP_TAP, "max-xl:h-11")}
          >
            <option value="">All United States</option>
            {stateOptions.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
          </select>

          <div className="mt-4">
            <span className="text-caption font-medium">Show</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as InstitutionKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={kinds.has(kind)}
                  onClick={() => toggleKind(kind)}
                  className={cn(
                    MAP_KIND,
                    kinds.has(kind) ? "bg-primary text-primary-foreground border-primary" : "bg-surface text-muted-foreground"
                  )}
                >
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-4">
            <SearchIcon aria-hidden className="text-muted-foreground absolute top-3 left-3 size-4" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={selectedState ? `Search ${selectedName} teams, metros, and cities` : "Search teams"}
              placeholder={selectedState ? "Search teams, metros, or cities" : "Search teams"}
              className={cn("pl-9", MAP_TAP)}
            />
          </div>

          <div className="mt-3 max-h-[330px] space-y-1 overflow-y-auto" aria-live="polite">
            {normalizedQuery ? (
              results.length ? (
                results.map((result) => {
                  if (result.type === "institution") {
                    const item = result.item
                    return (
                      <button
                        key={item[0]}
                        type="button"
                        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setSelectedState(item[3])
                          setSelectedMetro(institutionMetro(item))
                          setSelectedCity(item[4])
                          setHighlightedId(item[0])
                        }}
                      >
                        <MapPinIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item[1]}</span>
                          <span className="text-caption text-muted-foreground block truncate">
                            {`${KIND_SHORT[item[2]]} · ${item[4]}, ${item[3]}`}
                          </span>
                        </span>
                      </button>
                    )
                  }
                  if (result.type === "metro") {
                    const { item } = result
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setSelectedState(item.state)
                          setSelectedMetro(item.name)
                          setSelectedCity("")
                          setHighlightedId("")
                        }}
                      >
                        <MapPinIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.name} area</span>
                          <span className="text-caption text-muted-foreground block truncate">
                            {`${item.teamCount.toLocaleString()} teams · ${item.state}`}
                          </span>
                        </span>
                      </button>
                    )
                  }
                  const { item } = result
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none"
                      onClick={() => {
                        setSelectedState(item.state)
                        setSelectedCity(item.name)
                        setHighlightedId("")
                      }}
                    >
                      <MapPinIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="text-caption text-muted-foreground block truncate">
                          {`${item.teamCount.toLocaleString()} teams · ${item.state}`}
                        </span>
                      </span>
                    </button>
                  )
                })
              ) : <p className="text-caption text-muted-foreground px-2 py-4">No matches.</p>
            ) : selectedState && !selectedMetro && !selectedCity ? (
              <>
                <p className="text-caption text-muted-foreground px-1">
                  Zoom into a metro area or city. Dots are high school, college, and NFL teams only.
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["customer", "engaged", "available"] as const).map((status) => (
                    <div key={status} className="bg-muted/50 rounded-lg px-1 py-2">
                      <dt className="text-micro text-muted-foreground capitalize">{status === "available" ? "Other" : status}</dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {stateInstitutions.filter((item) => (statuses.get(item[0]) ?? "available") === status).length.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
                {metrosWithTeams.length > 0 && (
                  <>
                    <p className="text-caption text-muted-foreground mt-3 px-1 font-medium">Metro areas</p>
                    <ul className="mt-1 space-y-1">
                      {metrosWithTeams.map((metro) => (
                        <li key={metro.key}>
                          <button
                            type="button"
                            className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                            onClick={() => {
                              setSelectedMetro(metro.name)
                              setSelectedCity("")
                              setHighlightedId("")
                            }}
                          >
                            <span className="truncate font-medium">{metro.name} area</span>
                            <span className="text-caption text-muted-foreground shrink-0 tabular-nums">{metro.teamCount}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="text-caption text-muted-foreground mt-3 px-1 font-medium">Cities</p>
                <ul className="mt-1 space-y-1">
                  {navigationCities.map((city) => (
                    <li key={city.key}>
                      <button
                        type="button"
                        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setSelectedMetro("")
                          setSelectedCity(city.name)
                          setHighlightedId("")
                        }}
                      >
                        <span className="truncate font-medium">{city.name}</span>
                        <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
                          {city.teamCount > 0 ? city.teamCount : "Major city"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : selectedMetro && !selectedCity ? (
              <>
                <p className="text-caption text-muted-foreground px-1">
                  Metro view for {selectedMetro}. Pick a city to zoom further in.
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["customer", "engaged", "available"] as const).map((status) => (
                    <div key={status} className="bg-muted/50 rounded-lg px-1 py-2">
                      <dt className="text-micro text-muted-foreground capitalize">{status === "available" ? "Other" : status}</dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {visibleInstitutions.filter((item) => (statuses.get(item[0]) ?? "available") === status).length.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
                <ul className="mt-3 space-y-1">
                  {navigationCities.map((city) => (
                    <li key={city.key}>
                      <button
                        type="button"
                        className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                        onClick={() => {
                          setSelectedCity(city.name)
                          setHighlightedId("")
                        }}
                      >
                        <span className="truncate font-medium">{city.name}</span>
                        <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
                          {city.teamCount > 0 ? city.teamCount : "Major city"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : selectedCity ? (
              <>
                <p className="text-caption text-muted-foreground px-1">
                  City view shows every team in {selectedCity}. Click a dot for details.
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(["customer", "engaged", "available"] as const).map((status) => (
                    <div key={status} className="bg-muted/50 rounded-lg px-1 py-2">
                      <dt className="text-micro text-muted-foreground capitalize">{status === "available" ? "Other" : status}</dt>
                      <dd className="text-sm font-semibold tabular-nums">
                        {visibleInstitutions.filter((item) => (statuses.get(item[0]) ?? "available") === status).length.toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-caption text-muted-foreground px-1">
                Click a state to zoom, then open a metro area or city. Alaska and Hawaii use map insets.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
