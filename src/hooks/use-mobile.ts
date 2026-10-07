import * as React from "react"

/**
 * Deke breakpoints (file `mEEFvPkzpt9woPbW5wATec`):
 * - Phone (<768): 56px top bar + 288 overlay sheet (6:3, 6:70, 7:440)
 * - Tablet portrait (768–1023): 76px icon rail, overlay expands to 256 (6:493, 6:660)
 * - 1180+ / 1440: existing desktop rail (5:363, 5:3). 1440 is unchanged.
 */
export const PHONE_MAX_WIDTH = 767
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`

export const TABLET_MIN_WIDTH = 768
export const TABLET_MAX_WIDTH = 1023
export const TABLET_QUERY = `(min-width: ${TABLET_MIN_WIDTH}px) and (max-width: ${TABLET_MAX_WIDTH}px)`

function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    [query]
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // The server has no viewport; assume desktop and let hydration correct it.
    () => false
  )
}

export function useIsMobile() {
  return useMediaQuery(PHONE_QUERY)
}

export function useIsTablet() {
  return useMediaQuery(TABLET_QUERY)
}
