import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { InstitutionRecord, OpportunityStatus } from "@/lib/sales-map"

/**
 * Google's script never loads in tests: the map is a stand-in that reports a
 * camera (bounds + zoom) the way Google's `idle` event does, so what is tested
 * is our side — clustering, colors, names, and clicks.
 */
type Camera = { west: number; south: number; east: number; north: number; zoom: number }
let camera: Camera
let idle: (() => void) | null
const fakeMap = {
  fitBounds: vi.fn(),
  panTo: vi.fn(),
  setZoom: vi.fn(),
  getZoom: () => camera.zoom,
  getBounds: () => ({
    getNorthEast: () => ({ lat: () => camera.north, lng: () => camera.east }),
    getSouthWest: () => ({ lat: () => camera.south, lng: () => camera.west }),
  }),
  addListener: (_: string, fn: () => void) => {
    idle = fn
    return { remove: () => (idle = null) }
  },
}

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Map: ({ children }: { children: React.ReactNode }) => <div data-testid="google-map">{children}</div>,
  AdvancedMarker: ({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) => (
    <button type="button" aria-label={title} onClick={onClick}>
      {children}
    </button>
  ),
  ControlPosition: { TOP_LEFT: 1 },
  useMap: () => fakeMap,
}))

const { GoogleTerritoryMap } = await import("@/components/sales-opportunities/google-territory-map")

// Three Frisco schools a few blocks apart, and one in Austin.
const institutions: InstitutionRecord[] = [
  ["hs:1", "Frisco Centennial", "high-school", "TX", "Frisco", -96.80, 33.15],
  ["hs:2", "Frisco Lebanon Trail", "high-school", "TX", "Frisco", -96.81, 33.16],
  ["hs:3", "Frisco Memorial", "high-school", "TX", "Frisco", -96.79, 33.14],
  ["hs:4", "Austin Westlake", "high-school", "TX", "Austin", -97.80, 30.28],
]
const statuses = new Map<string, OpportunityStatus>([["hs:2", "customer"]])

function renderMap(onSelect = vi.fn()) {
  render(
    <GoogleTerritoryMap
      config={{ apiKey: "test-key", mapId: "DEMO_MAP_ID" }}
      institutions={institutions}
      statuses={statuses}
      focusBounds={null}
      highlightedId=""
      onSelect={onSelect}
    />
  )
  return onSelect
}

function settle(next: Camera) {
  camera = next
  act(() => idle?.())
}

describe("GoogleTerritoryMap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    idle = null
    camera = { west: -125, south: 24, east: -66, north: 50, zoom: 4 }
  })

  it("groups nearby schools into a numbered bubble when zoomed out", () => {
    renderMap()
    settle({ west: -125, south: 24, east: -66, north: 50, zoom: 4 })
    expect(screen.getByRole("button", { name: /^3 teams, 1 customers\. Click to zoom in\.$/ })).toHaveTextContent("3")
    expect(screen.getByRole("button", { name: "Austin Westlake" })).toBeInTheDocument()
    expect(screen.queryByText("Frisco Centennial")).not.toBeInTheDocument()
  })

  it("clicking a bubble zooms into it", async () => {
    renderMap()
    settle({ west: -125, south: 24, east: -66, north: 50, zoom: 4 })
    await userEvent.click(screen.getByRole("button", { name: /^3 teams/ }))
    expect(fakeMap.panTo).toHaveBeenCalled()
    expect(fakeMap.setZoom).toHaveBeenCalledWith(expect.any(Number))
    expect(fakeMap.setZoom.mock.calls[0][0]).toBeGreaterThan(4)
  })

  it("shows every school by name at town zoom, and only what is on screen", async () => {
    const onSelect = renderMap()
    settle({ west: -96.9, south: 33.1, east: -96.7, north: 33.2, zoom: 14 })
    expect(screen.getByText("Frisco Centennial")).toBeInTheDocument()
    expect(screen.getByText("Frisco Lebanon Trail")).toBeInTheDocument()
    expect(screen.getByText("Frisco Memorial")).toBeInTheDocument()
    expect(screen.queryByText("Austin Westlake")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Frisco Memorial" }))
    expect(onSelect).toHaveBeenCalledWith("hs:3")
  })

  it("frames the whole country when nothing is picked", () => {
    renderMap()
    expect(fakeMap.fitBounds).toHaveBeenCalledWith({ west: -124.8, south: 24.4, east: -66.9, north: 49.4 }, 24)
  })
})
