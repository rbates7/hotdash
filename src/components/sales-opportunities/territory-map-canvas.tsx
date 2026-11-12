"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { geoAlbersUsa, geoContains, geoMercator, geoPath, type GeoProjection } from "d3-geo"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import { ArrowLeftIcon, LoaderCircleIcon, MapPinIcon, MinusIcon, PlusIcon, RotateCcwIcon, SearchIcon } from "lucide-react"

import {
  boundsCorners,
  cityPopulation,
  displayCityName,
  featureBounds,
  focusInstitutionBounds,
  IDENTITY_VIEW,
  institutionMetro,
  isMajorCity,
  MAP_ZOOM_LIMITS,
  metroLabel,
  opportunityStatus,
  paddedInstitutionBounds,
  panView,
  placeLabels,
  pointInBounds,
  rankSearchMatches,
  relaxScreenPoints,
  spreadScreenPoints,
  type SearchCandidate,
  territoryCityKey,
  territoryMetroKey,
  type CityRecord,
  type InstitutionKind,
  type InstitutionRecord,
  type MapView,
  zoomViewAt,
} from "@/lib/sales-map"
import { cn } from "@/lib/utils"
import { useDeals } from "@/components/sales-opportunities/deals-store"
import type { GoogleMapsConfig } from "@/components/sales-opportunities/google-territory-map"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Google's map script only runs in the browser, and only when a key is set.
const GoogleTerritoryMap = dynamic(
  () => import("@/components/sales-opportunities/google-territory-map").then((mod) => mod.GoogleTerritoryMap),
  { ssr: false }
)

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

const KIND_WEIGHT: Record<InstitutionKind, number> = { nfl: 3, college: 2, "high-school": 1 }

type SearchValue =
  | { type: "institution"; item: InstitutionRecord }
  | { type: "metro"; item: MetroWithTeams }
  | { type: "city"; item: CityWithTeams }

function projectionFor(
  width: number,
  height: number,
  states: States,
  selected: StateFeature | undefined,
  focusBounds: [[number, number], [number, number]] | null,
  view: MapView = IDENTITY_VIEW
): GeoProjection {
  const extent: [[number, number], [number, number]] = [[24, 24], [width - 24, height - 24]]
  const fitted = focusBounds
    ? geoMercator().fitExtent(extent, boundsCorners(focusBounds))
    : selected
      ? geoMercator().fitExtent(extent, selected)
      : geoAlbersUsa().fitExtent(extent, states)
  if (view.k === 1 && view.x === 0 && view.y === 0) return fitted
  const [tx, ty] = fitted.translate()
  return fitted.scale(fitted.scale() * view.k).translate([tx * view.k + view.x, ty * view.k + view.y])
}

/** Wheel notches and trackpad pinches (ctrlKey) as a zoom factor. */
function wheelFactor(event: WheelEvent): number {
  const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
  const delta = event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0015)
  return Math.exp(-Math.max(-1, Math.min(1, delta)))
}

/** Projection scale (px per radian) at ~10 m per pixel: Earth's radius / 10 m. */
const STREET_LEVEL_SCALE = 637_100

/** Schools get names on the map once this few are on screen. */
const LABEL_TEAM_LIMIT = 150

const STATUS_PRIORITY = { customer: 0, engaged: 1, available: 2 } as const
const STATUS_LABEL = { customer: "Customer", engaged: "Engaged", available: "Not a customer" } as const

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
    const name = displayCityName(city[1])
    const key = territoryCityKey(name, city[3])
    if (!grouped.has(key)) grouped.set(key, { key, name, state: city[3], teamCount: 0 })
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
}

function shouldLabelCity(
  city: CityRecord,
  selectedState: string,
  selectedMetro: string,
  selectedCity: string,
  zoom = 1
): boolean {
  const pop = cityPopulation(city)
  if (selectedCity && zoom < 2) {
    return territoryCityKey(displayCityName(city[1]), city[3]) === territoryCityKey(selectedCity, selectedState)
  }
  if (selectedCity || selectedMetro || zoom >= 6) return pop >= 25_000
  if (selectedState || zoom >= 3) return pop >= 75_000
  return pop >= 250_000
}

/**
 * `googleMaps` set: Google Maps with street, town and satellite detail.
 * Not set (no key yet, tests, CI): the built-in drawn map below, which
 * scrolls, pinches and drags down to school level too.
 */
export function TerritoryMap({ googleMaps = null }: { googleMaps?: GoogleMapsConfig | null }) {
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
  // The user's zoom belongs to one fitted view: picking another state, metro
  // or city (or resizing) starts that view unzoomed, with no effect needed.
  const scopeKey = `${selectedState}|${selectedMetro}|${selectedCity}|${size.width}x${size.height}`
  const [zoomState, setZoomState] = React.useState<{ scope: string; view: MapView }>({ scope: "", view: IDENTITY_VIEW })
  const view = zoomState.scope === scopeKey ? zoomState.view : IDENTITY_VIEW
  const setView = React.useCallback(
    (next: (current: MapView) => MapView) =>
      setZoomState((state) => ({ scope: scopeKey, view: next(state.scope === scopeKey ? state.view : IDENTITY_VIEW) })),
    [scopeKey]
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
    const bounds = focusInstitutionBounds(
      visibleInstitutions,
      selectedCity ? { trim: 0, maxRadius: 0.4 } : { trim: 0.04 }
    )
    if (bounds) {
      return paddedInstitutionBounds(bounds, {
        padding: selectedCity ? 0.18 : 0.1,
        minSpan: selectedCity ? 0.04 : 0.07,
      })
    }
    if (selectedCity) {
      const place = stateMajorCities.find(
        (city) => territoryCityKey(displayCityName(city[1]), city[3]) === territoryCityKey(selectedCity, selectedState)
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
  // In a metro, list only the cities that hold that metro's teams, never
  // every major city in the state (Abilene is not in the Houston area).
  const navigationCities = React.useMemo(
    () => navigationCitiesFrom(selectedMetro ? [] : stateMajorCities, citiesWithTeams),
    [citiesWithTeams, selectedMetro, stateMajorCities]
  )
  // Teams with no street address share the city-center point; the map fans
  // them out, and the city view says so instead of implying exact spots.
  const centerStacked = React.useMemo(() => {
    if (!selectedCity) return 0
    const stacks = new Map<string, number>()
    for (const item of visibleInstitutions) {
      const key = `${item[5].toFixed(4)}|${item[6].toFixed(4)}`
      stacks.set(key, (stacks.get(key) ?? 0) + 1)
    }
    return [...stacks.values()].filter((count) => count > 8).reduce((sum, count) => sum + count, 0)
  }, [selectedCity, visibleInstitutions])
  const kindInstitutions = React.useMemo(
    () => institutions.filter((item) => kinds.has(item[2])),
    [institutions, kinds]
  )
  const googleFocus = React.useMemo(
    () => focusBounds ?? (selectedFeature ? featureBounds(selectedFeature) : null),
    [focusBounds, selectedFeature]
  )
  // Deepest zoom is about street level (~10 m per pixel) whatever view you start from.
  const zoomLimits = React.useMemo(() => {
    if (!states || !size.width || !size.height) return MAP_ZOOM_LIMITS
    const fittedScale = projectionFor(size.width, size.height, states, selectedFeature, focusBounds).scale()
    return { min: 1, max: Math.max(2, Math.min(MAP_ZOOM_LIMITS.max, STREET_LEVEL_SCALE / fittedScale)) }
  }, [focusBounds, selectedFeature, size.height, size.width, states])
  const zoomBy = (factor: number) =>
    setView((current) => zoomViewAt(current, factor, [size.width / 2, size.height / 2], zoomLimits))
  const outsideView = React.useMemo(() => {
    if (!focusBounds) return 0
    return visibleInstitutions.filter((item) => !pointInBounds(item[5], item[6], focusBounds)).length
  }, [focusBounds, visibleInstitutions])

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

    const projection = projectionFor(size.width, size.height, states, selectedFeature, focusBounds, view)
    projectionRef.current = projection
    const path = geoPath(projection, context)
    const zoomed = Boolean(selectedFeature) || view.k >= 2
    // Dots grow as you zoom, but slowly, so a city of schools stays readable.
    const grow = Math.min(1 + Math.log2(view.k) * 0.45, 3)
    const onScreen = ([x, y]: [number, number], margin = 24) =>
      x >= -margin && y >= -margin && x <= size.width + margin && y <= size.height + margin

    for (const state of selectedFeature ? [selectedFeature] : states.features) {
      context.beginPath()
      path(state)
      context.fillStyle = "#ffffff"
      context.fill()
      context.strokeStyle = "#66756c"
      context.lineWidth = selectedFeature ? 1.8 : 0.85
      context.stroke()
    }

    const labelFont = "600 11px system-ui, sans-serif"
    const labelCandidates: Array<{
      id: string
      x: number
      y: number
      width: number
      height: number
      text: string
      color: string
    }> = []
    if (zoomed || !selectedState) {
      context.font = labelFont
      const byPopulation = [...visibleMajorCities].sort((a, b) => cityPopulation(b) - cityPopulation(a))
      for (const city of byPopulation) {
        const point = projection([city[4], city[5]])
        if (!point || !onScreen(point)) continue
        context.beginPath()
        context.arc(point[0], point[1], selectedCity ? 3.2 : 2.4, 0, Math.PI * 2)
        context.fillStyle = "#dfe5e0"
        context.fill()
        context.strokeStyle = "#7a8a82"
        context.lineWidth = 1
        context.stroke()
        if (shouldLabelCity(city, selectedState, selectedMetro, selectedCity, view.k)) {
          const text = displayCityName(city[1])
          labelCandidates.push({
            id: city[0],
            x: point[0],
            y: point[1],
            width: Math.ceil(context.measureText(text).width),
            height: 11,
            text,
            color: "#334155",
          })
        }
      }
    }

    const fanOut = Boolean(selectedCity) || view.k >= 4
    const spreadRadius = fanOut ? 16 : selectedMetro ? 12 : 0
    const baseRadius = (kind: InstitutionKind) =>
      selectedCity
        ? (kind === "nfl" ? 7 : 5.5)
        : selectedMetro
          ? (kind === "nfl" ? 6 : 4.4)
          : selectedState
            ? (kind === "nfl" ? 4.2 : 2.5)
            : (kind === "nfl" ? 2.8 : 1.35)
    const pinRadius = (kind: InstitutionKind) => Math.min(baseRadius(kind) * grow, 9)
    const layout =
      spreadRadius > 0
        ? relaxScreenPoints(
            spreadScreenPoints(
              visibleInstitutions,
              (lon, lat) => projection([lon, lat]),
              spreadRadius,
              fanOut ? 14 : 10
            ),
            fanOut ? 12.5 : 9.5
          )
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

    const shown: Array<{ item: InstitutionRecord; point: [number, number]; radius: number }> = []
    for (const item of drawOrder) {
      const point = layout.get(item[0])
      if (!point || !onScreen(point)) continue
      const status = statuses.get(item[0]) ?? "available"
      const radius = pinRadius(item[2])
      shown.push({ item, point, radius })
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

    // School names once you are close enough to read them. They go ahead of
    // the city labels: the highlighted school, then customers, engaged, the rest.
    if (shown.length <= LABEL_TEAM_LIMIT && (selectedState || view.k >= 8)) {
      context.font = labelFont
      const schools = [...shown]
        .sort((a, b) => {
          if (a.item[0] === highlightedId) return -1
          if (b.item[0] === highlightedId) return 1
          return (
            STATUS_PRIORITY[statuses.get(a.item[0]) ?? "available"] -
              STATUS_PRIORITY[statuses.get(b.item[0]) ?? "available"] || a.item[1].localeCompare(b.item[1])
          )
        })
        .map(({ item, point, radius }) => ({
          id: item[0],
          // placeLabels puts a label `gap` (5px) right of x and its bottom 5px
          // above y: these offsets clear the dot and centre the name on it.
          x: point[0] + radius - 3,
          y: point[1] + 10.5,
          width: Math.ceil(context.measureText(item[1]).width),
          height: 11,
          text: item[1],
          color: item[0] === highlightedId ? "#1d4ed8" : "#0f172a",
        }))
      labelCandidates.unshift(...schools)
    }

    // Labels go on top of the dots, in priority order; a label that would
    // overlap one already drawn (or run off the map) is skipped.
    context.font = labelFont
    context.textBaseline = "top"
    context.lineJoin = "round"
    const byId = new Map(labelCandidates.map((item) => [item.id, item]))
    for (const label of placeLabels(labelCandidates, size.width, size.height)) {
      const candidate = byId.get(label.id)
      if (!candidate) continue
      context.strokeStyle = "rgba(255,255,255,0.9)"
      context.lineWidth = 3
      context.strokeText(candidate.text, label.left, label.top)
      context.fillStyle = candidate.color
      context.fillText(candidate.text, label.left, label.top)
    }
    context.textBaseline = "alphabetic"
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
    view,
    visibleInstitutions,
    visibleMajorCities,
  ])

  // Wheel and trackpad zoom. Native listener: React's wheel handler is passive
  // and cannot stop the page from scrolling while you zoom the map.
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
      setView((current) => zoomViewAt(current, wheelFactor(event), point, zoomLimits))
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [setView, states, zoomLimits])

  // Drag to pan, two fingers to pinch. A press that barely moves stays a click.
  const pointersRef = React.useRef(new Map<number, [number, number]>())
  const gestureRef = React.useRef({ moved: false, distance: 0 })
  const localPoint = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, localPoint(event))
    if (pointersRef.current.size === 1) gestureRef.current = { moved: false, distance: 0 }
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()]
      gestureRef.current = { moved: true, distance: Math.hypot(a[0] - b[0], a[1] - b[1]) }
    }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const previous = pointersRef.current.get(event.pointerId)
    if (!previous) return
    const point = localPoint(event)
    pointersRef.current.set(event.pointerId, point)
    if (pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()]
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1])
      const center: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const last = gestureRef.current.distance
      gestureRef.current = { moved: true, distance }
      if (last > 0 && distance > 0) setView((current) => zoomViewAt(current, distance / last, center, zoomLimits))
      return
    }
    const dx = point[0] - previous[0]
    const dy = point[1] - previous[1]
    if (!gestureRef.current.moved && Math.hypot(dx, dy) < 4) {
      pointersRef.current.set(event.pointerId, previous)
      return
    }
    gestureRef.current.moved = true
    setView((current) => panView(current, dx, dy))
  }
  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 1) gestureRef.current.distance = 0
  }

  const stateOptions = React.useMemo(
    () => states?.features.map((item) => item.properties).sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [states]
  )
  const selectedName = stateOptions.find((state) => state.code === selectedState)?.name
  const territoryTitle = selectedCity && selectedName
    ? `${selectedCity}, ${selectedName} territory`
    : selectedMetro && selectedName
      ? `${metroLabel(selectedMetro)}, ${selectedName} territory`
      : selectedName
        ? `${selectedName} territory`
        : "United States territory"
  // Follows the Show filters once the team list has loaded (NFL only -> 32).
  const nationwideTeams = institutions.length
    ? stateInstitutions.length
    : manifest
      ? manifest.counts.highSchools + manifest.counts.colleges + manifest.counts.nflTeams
      : 0
  const nationwideNoun =
    kinds.size === 1 && kinds.has("nfl")
      ? "NFL teams"
      : kinds.size === 1 && kinds.has("college")
        ? "college football teams"
        : kinds.size === 1 && kinds.has("high-school")
          ? "high school football teams"
          : "football teams"
  const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`
  const subtitle = selectedCity
    ? `${plural(visibleInstitutions.length, "team", "teams")} in ${selectedCity}${outsideView ? ` · ${outsideView.toLocaleString()} outside this view` : ""}`
    : selectedMetro
      ? `${plural(visibleInstitutions.length, "team", "teams")} in the ${metroLabel(selectedMetro)} · ${plural(citiesWithTeams.length, "city", "cities")}${outsideView ? ` · ${outsideView.toLocaleString()} outside this view` : ""}`
      : selectedState
        ? `${metrosWithTeams.length.toLocaleString()} metro areas · ${citiesWithTeams.length.toLocaleString()} cities · ${stateInstitutions.length.toLocaleString()} teams`
      : manifest
        ? `${nationwideTeams.toLocaleString()} ${nationwideNoun} nationwide`
        : "Loading high school, college, and NFL teams"
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const searchCities = React.useMemo(
    () => (selectedState ? navigationCitiesFrom(stateMajorCities, citiesWithTeamsFrom(stateInstitutions)) : citiesWithTeamsFrom(stateInstitutions)),
    [selectedState, stateInstitutions, stateMajorCities]
  )
  const results = React.useMemo(() => {
    if (!normalizedQuery) return []
    function* candidates(): Generator<SearchCandidate<SearchValue>> {
      for (const item of metrosWithTeams) {
        yield { type: "metro", name: item.name, weight: item.teamCount, value: { type: "metro", item } }
      }
      for (const item of searchCities) {
        yield { type: "city", name: item.name, weight: item.teamCount, value: { type: "city", item } }
      }
      for (const item of stateInstitutions) {
        yield {
          type: "institution",
          name: item[1],
          place: item[4],
          weight: KIND_WEIGHT[item[2]],
          value: { type: "institution", item },
        }
      }
    }
    return rankSearchMatches(normalizedQuery, candidates()).map((match) => match.value)
  }, [metrosWithTeams, normalizedQuery, searchCities, stateInstitutions])
  const highlighted = institutions.find((item) => item[0] === highlightedId)
  const cityTeams = React.useMemo(
    () =>
      selectedCity
        ? [...visibleInstitutions].sort(
            (a, b) =>
              STATUS_PRIORITY[statuses.get(a[0]) ?? "available"] - STATUS_PRIORITY[statuses.get(b[0]) ?? "available"] ||
              a[1].localeCompare(b[1])
          )
        : [],
    [selectedCity, statuses, visibleInstitutions]
  )

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
    if (gestureRef.current.moved) {
      gestureRef.current.moved = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    if (!selectedState && view.k < 3) {
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

    const hitRadius = Math.max(selectedCity ? 16 : selectedMetro ? 14 : 10, 10 + Math.log2(view.k) * 2)
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

    let closestCity = { name: "", state: "", distance: 12 }
    for (const city of visibleMajorCities) {
      const projected = projection([city[4], city[5]])
      if (!projected) continue
      const distance = Math.hypot(projected[0] - point[0], projected[1] - point[1])
      if (distance < closestCity.distance) closestCity = { name: displayCityName(city[1]), state: city[3], distance }
    }
    if (closestCity.name) {
      if (!selectedState) setSelectedState(closestCity.state)
      setSelectedCity(closestCity.name)
      setHighlightedId("")
    }
  }

  const zoomInAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setView((current) => zoomViewAt(current, 2.5, [event.clientX - rect.left, event.clientY - rect.top], zoomLimits))
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
                    ? `Back to ${metroLabel(selectedMetro)}`
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
          {googleMaps ? (
            states && (
              <GoogleTerritoryMap
                config={googleMaps}
                institutions={kindInstitutions}
                statuses={statuses}
                focusBounds={googleFocus}
                highlightedId={highlightedId}
                onSelect={setHighlightedId}
              />
            )
          ) : (
            <>
              <canvas
                ref={canvasRef}
                aria-label="Interactive United States sales map. Scroll or pinch to zoom, drag to move."
                onClick={pickFromCanvas}
                onDoubleClick={zoomInAt}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                className={cn("block size-full touch-none", view.k > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
              />
              {states && !error && (
                <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white/95 text-slate-800 shadow-sm">
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => zoomBy(2)}
                    disabled={view.k >= zoomLimits.max}
                    className="grid size-9 place-items-center hover:bg-slate-100 disabled:opacity-40 max-xl:size-11"
                  >
                    <PlusIcon className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => zoomBy(0.5)}
                    disabled={view.k <= MAP_ZOOM_LIMITS.min}
                    className="grid size-9 place-items-center border-t border-slate-200 hover:bg-slate-100 disabled:opacity-40 max-xl:size-11"
                  >
                    <MinusIcon className="size-4" aria-hidden />
                  </button>
                  {view.k > 1 && (
                    <button
                      type="button"
                      aria-label="Reset zoom"
                      onClick={() => setView(() => IDENTITY_VIEW)}
                      className="grid size-9 place-items-center border-t border-slate-200 hover:bg-slate-100 max-xl:size-11"
                    >
                      <RotateCcwIcon className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
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
            <div
              className={cn(
                "absolute left-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-900 shadow",
                // Clear Google's logo and terms along the bottom edge.
                googleMaps ? "bottom-9" : "bottom-3"
              )}
            >
              <strong>{highlighted[1]}</strong>
              <span className="ml-1.5 text-slate-600">
                {`${KIND_SHORT[highlighted[2]]} · ${highlighted[4]}, ${highlighted[3]} · ${STATUS_LABEL[statuses.get(highlighted[0]) ?? "available"]}`}
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
            <SearchIcon aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={selectedState ? `Search ${selectedName} teams, metros, and cities` : "Search teams"}
              placeholder={selectedState ? "Search teams, metros, or cities" : "Search teams"}
              className={cn("pl-9!", MAP_TAP)}
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
                          <span className="block truncate text-sm font-medium">{metroLabel(item.name)}</span>
                          <span className="text-caption text-muted-foreground block truncate">
                            {`${item.teamCount.toLocaleString()} ${item.teamCount === 1 ? "team" : "teams"} · ${item.state}`}
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
                        setSelectedMetro("")
                        setSelectedCity(item.name)
                        setHighlightedId("")
                      }}
                    >
                      <MapPinIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="text-caption text-muted-foreground block truncate">
                          {`${item.teamCount.toLocaleString()} ${item.teamCount === 1 ? "team" : "teams"} · ${item.state}`}
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
                            <span className="truncate font-medium">{metroLabel(metro.name)}</span>
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
                  Metro view for the {metroLabel(selectedMetro)}. Pick a city to zoom further in.
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
                  Every team in {selectedCity}. Pick one to find it on the map, or zoom in on the map.
                </p>
                {centerStacked > 0 && (
                  <p className="text-caption text-muted-foreground mt-2 px-1">
                    {centerStacked.toLocaleString()} of these teams only have a city-center location, so they are fanned out
                    around the center of {selectedCity} rather than at their street address.
                  </p>
                )}
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
                <ul aria-label={`Teams in ${selectedCity}`} className="mt-3 space-y-1">
                  {cityTeams.map((item) => {
                    const status = statuses.get(item[0]) ?? "available"
                    return (
                      <li key={item[0]}>
                        <button
                          type="button"
                          aria-pressed={item[0] === highlightedId}
                          className={cn(MAP_LIST_BTN, "items-start gap-2 py-2", item[0] === highlightedId && "bg-muted")}
                          onClick={() => setHighlightedId(item[0])}
                        >
                          <i
                            aria-hidden
                            className="mt-1 size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: STATUS_COLOR[status] }}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{item[1]}</span>
                            <span className="text-caption text-muted-foreground block truncate">
                              {`${KIND_SHORT[item[2]]} · ${STATUS_LABEL[status]}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="text-caption text-muted-foreground px-1">
                Click a state, or scroll, pinch and drag to zoom anywhere. School names appear as you get close. Alaska and
                Hawaii use map insets.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
