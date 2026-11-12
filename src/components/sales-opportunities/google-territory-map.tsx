"use client"

import * as React from "react"
import {
  AdvancedMarker,
  APIProvider,
  ControlPosition,
  Map,
  useMap,
} from "@vis.gl/react-google-maps"
import Supercluster from "supercluster"

import type { InstitutionRecord, OpportunityStatus } from "@/lib/sales-map"

/**
 * The territory map on Google Maps: real streets, towns and satellite under
 * the team dots. Nearby teams merge into numbered bubbles when zoomed out
 * (colored by the best status inside them) and split into named dots as you
 * zoom in. Only what is on screen becomes a marker, so all ~14,500 teams stay fast.
 */

export type GoogleMapsConfig = { apiKey: string; mapId: string }

type Bounds = [[number, number], [number, number]]
type PointProps = { id: string; name: string; status: OpportunityStatus; nfl: boolean }
type ClusterProps = { customers: number; engaged: number }

export const STATUS_COLOR = {
  customer: "#16884f",
  engaged: "#d9a700",
  available: "#9aa29d",
} as const

/** Contiguous US, for the opening view. */
const US_BOUNDS: Bounds = [[-124.8, 24.4], [-66.9, 49.4]]

/** Team names show under the dots from this zoom (about a town). */
const LABEL_ZOOM = 12

/** Zoom a search or list pick lands on: a few blocks around the school. */
const FOCUS_ZOOM = 15

function toLatLngBounds([[west, south], [east, north]]: Bounds) {
  return { west, south, east, north }
}

type Props = {
  config: GoogleMapsConfig
  institutions: readonly InstitutionRecord[]
  statuses: ReadonlyMap<string, OpportunityStatus>
  /** The current state, metro or city; null for the whole country. */
  focusBounds: Bounds | null
  highlightedId: string
  onSelect: (id: string) => void
}

export function GoogleTerritoryMap({ config, ...props }: Props) {
  return (
    <APIProvider apiKey={config.apiKey}>
      <Map
        mapId={config.mapId}
        defaultBounds={toLatLngBounds(props.focusBounds ?? US_BOUNDS)}
        // One finger pans on phones and the wheel zooms without Ctrl, like the Google Maps app.
        gestureHandling="greedy"
        mapTypeControl
        mapTypeControlOptions={{ position: ControlPosition.TOP_LEFT }}
        streetViewControl={false}
        fullscreenControl
        clickableIcons={false}
        className="size-full"
      >
        <TeamMarkers {...props} />
      </Map>
    </APIProvider>
  )
}

function TeamMarkers({ institutions, statuses, focusBounds, highlightedId, onSelect }: Omit<Props, "config">) {
  const map = useMap()
  const [camera, setCamera] = React.useState<{ bbox: [number, number, number, number]; zoom: number } | null>(null)

  const index = React.useMemo(() => {
    const cluster = new Supercluster<PointProps, ClusterProps>({
      radius: 56,
      maxZoom: 13,
      map: (point) => ({
        customers: point.status === "customer" ? 1 : 0,
        engaged: point.status === "engaged" ? 1 : 0,
      }),
      reduce: (sum, point) => {
        sum.customers += point.customers
        sum.engaged += point.engaged
      },
    })
    cluster.load(
      institutions.map(([id, name, kind, , , lon, lat]) => ({
        type: "Feature" as const,
        properties: { id, name, status: statuses.get(id) ?? "available", nfl: kind === "nfl" },
        geometry: { type: "Point" as const, coordinates: [lon, lat] },
      }))
    )
    return cluster
  }, [institutions, statuses])

  // Follow the sidebar: picking a state, metro or city frames it.
  const focusKey = focusBounds ? focusBounds.flat().join(",") : "us"
  React.useEffect(() => {
    if (!map) return
    map.fitBounds(toLatLngBounds(focusBounds ?? US_BOUNDS), 24)
    // focusKey stands in for focusBounds, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusKey])

  // A team picked from search or the list: fly to it.
  React.useEffect(() => {
    if (!map || !highlightedId) return
    const record = institutions.find((item) => item[0] === highlightedId)
    if (!record) return
    map.panTo({ lat: record[6], lng: record[5] })
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM)
  }, [highlightedId, institutions, map])

  // Rebuild markers when the map settles, for what is on screen at that zoom.
  React.useEffect(() => {
    if (!map) return
    const listener = map.addListener("idle", () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      if (!bounds || zoom === undefined) return
      const ne = bounds.getNorthEast()
      const sw = bounds.getSouthWest()
      setCamera({ bbox: [sw.lng(), sw.lat(), ne.lng(), ne.lat()], zoom: Math.round(zoom) })
    })
    return () => listener.remove()
  }, [map])

  if (!camera) return null
  const features = index.getClusters(camera.bbox, camera.zoom)
  const showLabels = camera.zoom >= LABEL_ZOOM

  return (
    <>
      {features.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates
        if ("cluster" in feature.properties && feature.properties.cluster) {
          const { cluster_id, point_count, point_count_abbreviated, customers, engaged } = feature.properties
          const tone = customers > 0 ? "customer" : engaged > 0 ? "engaged" : "available"
          const size = Math.min(52, 26 + Math.log10(point_count) * 10)
          return (
            <AdvancedMarker
              key={`cluster-${cluster_id}`}
              position={{ lat, lng }}
              anchorLeft="-50%"
              anchorTop="-50%"
              title={`${point_count.toLocaleString()} teams${customers ? `, ${customers} customers` : ""}${engaged ? `, ${engaged} engaged` : ""}. Click to zoom in.`}
              onClick={() => {
                if (!map) return
                map.panTo({ lat, lng })
                map.setZoom(Math.min(index.getClusterExpansionZoom(cluster_id), 20))
              }}
            >
              <div
                className="grid place-items-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md"
                style={{ width: size, height: size, backgroundColor: STATUS_COLOR[tone] }}
              >
                {point_count_abbreviated}
              </div>
            </AdvancedMarker>
          )
        }

        const { id, name, status, nfl } = feature.properties as PointProps
        const highlighted = id === highlightedId
        const dot = nfl ? 16 : 12
        return (
          <AdvancedMarker
            key={id}
            position={{ lat, lng }}
            title={name}
            anchorLeft={`-${dot / 2}px`}
            anchorTop="-50%"
            zIndex={highlighted ? 1000 : status === "customer" ? 3 : status === "engaged" ? 2 : 1}
            onClick={() => onSelect(id)}
          >
            {/* The dot sits on the school; the name hangs to its right. */}
            <div className="flex items-center gap-1">
              <span
                className="block shrink-0 rounded-full border-2 border-white shadow"
                style={{
                  width: dot,
                  height: dot,
                  backgroundColor: STATUS_COLOR[status],
                  outline: highlighted ? "3px solid #2563eb" : undefined,
                  outlineOffset: 2,
                }}
              />
              {(showLabels || highlighted) && (
                <span
                  className="rounded bg-white/90 px-1 text-[11px] leading-4 font-semibold whitespace-nowrap text-slate-900 shadow-sm"
                  style={highlighted ? { color: "#1d4ed8" } : undefined}
                >
                  {name}
                </span>
              )}
            </div>
          </AdvancedMarker>
        )
      })}
    </>
  )
}
