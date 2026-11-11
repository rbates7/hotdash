# Territory map on Google Maps

The Sales Opportunities territory map runs on Google Maps when the server has
`GOOGLE_MAPS_BROWSER_KEY`. Streets, towns, water and satellite sit under the
team dots; you scroll, pinch and drag like the Google Maps app, all the way
down to one school.

With no key (local dev, tests, CI) the page shows the built-in drawn map
instead, which still zooms to school level. Nothing breaks without the key.

## What you see

- **Zoomed out:** nearby teams merge into numbered bubbles. A bubble is green
  if any team inside is a customer, yellow if any is engaged, gray otherwise.
  Click a bubble to zoom into it.
- **Zoomed in (about town level, zoom 12+):** every team is its own dot with
  its name beside it. Click a dot for its card (name, type, city, status).
- **Sidebar:** picking a state, metro area or city frames it on the map;
  picking a team from search or the city list flies to it.
- Map / Satellite switch top left, full screen top right.

Only teams on screen become markers (`supercluster` + Google Advanced
Markers), so all ~14,500 teams stay fast.

## Setup (Google Cloud, once)

1. In the Google Cloud project, **enable the Maps JavaScript API**
   (APIs & Services → Library). Billing must be on for the project; Google
   includes a free monthly allowance of map loads.
2. **Create an API key** (APIs & Services → Credentials → Create credentials
   → API key) and restrict it:
   - Application restriction: **Websites**. Add the dashboard's production
     domain, `https://*.vercel.app/*` only if you want previews to work, and
     `http://localhost:3000/*` for local dev.
   - API restriction: **Maps JavaScript API** only.
3. Optional: **create a Map ID** (Google Maps Platform → Map management →
   Create map ID, type JavaScript, Vector). It lets you restyle the map in
   Google Cloud without a deploy. Without one the app uses `DEMO_MAP_ID`.
4. **Add to Vercel** (Production, and Preview if wanted):
   `GOOGLE_MAPS_BROWSER_KEY` and, if made, `GOOGLE_MAPS_MAP_ID`. Redeploy.

## Why the key is visible, and why that is fine

Google's map script takes the key in its URL, so any visitor can read it.
That is true of every Google Maps site. The protection is the restrictions
in step 2: from any other site, or for any other Google API, the key is
refused. Set a budget alert on the project as well. The key is still read
on the server per request (`src/lib/google-maps-config.ts`) and passed to
the map, never baked into the client bundle, so swapping it needs only a
redeploy.

## Files

- `src/components/sales-opportunities/google-territory-map.tsx`: the Google map,
  clustering, markers and labels.
- `src/components/sales-opportunities/territory-map-canvas.tsx`: chooses Google
  or the built-in map; header, legend and sidebar are shared.
- `src/lib/google-maps-config.ts`: reads the two settings on the server.
- Tests: `google-territory-map.test.tsx` (Google is stubbed: clustering, names,
  clicks, framing).
