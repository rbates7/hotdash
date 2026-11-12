import "server-only"

import type { GoogleMapsConfig } from "@/components/sales-opportunities/google-territory-map"

/**
 * Google Maps for the Sales Opportunities territory map, read per request on
 * the server (the page is force-dynamic), so adding the key in Vercel needs
 * a redeploy but no rebuild of client code.
 *
 * `GOOGLE_MAPS_BROWSER_KEY` is a browser key: Google sends it in the map
 * script's URL, so every visitor can see it. That is how Maps keys work;
 * what protects it is the key's restrictions in Google Cloud (this site's
 * addresses only, Maps JavaScript API only). See docs/google-maps.md.
 *
 * `GOOGLE_MAPS_MAP_ID` is optional: Google's demo map ID works, a real one
 * lets you restyle the map from Google Cloud without a deploy.
 *
 * No key: null, and the page keeps the built-in drawn map.
 */
export function googleMapsConfig(): GoogleMapsConfig | null {
  const apiKey = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim()
  if (!apiKey) return null
  return { apiKey, mapId: process.env.GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID" }
}
