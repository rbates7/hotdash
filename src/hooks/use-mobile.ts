import * as React from "react"

/**
 * Compact viewports (phone + tablet portrait) use a menu button + drawer.
 * `lg` in Tailwind is 1024px, so this query is exactly "below desktop /
 * tablet landscape". 1440×900 and 1180×820 stay on the existing rail.
 */
export const COMPACT_MAX_WIDTH = 1023
export const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(COMPACT_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT_QUERY).matches,
    // The server has no viewport; assume desktop and let hydration correct it.
    () => false
  )
}
