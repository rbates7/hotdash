import * as React from "react"

/**
 * Deke breakpoints (file `mEEFvPkzpt9woPbW5wATec`, frame 7:47):
 * - Phone (<768): 56px top bar + 288 overlay sheet (6:3, 6:70, 7:440)
 * - Tablet (768–1279): 44px rows. Portrait (768–1023) is the 76px icon rail
 *   and 256 overlay (6:493, 6:660). Landscape / 1180 (5:363) is the expanded
 *   rail with a pinned footer.
 * - Desktop (≥1280 / 1440): existing 32px rail (5:3). Untouched.
 */
export const PHONE_MAX_WIDTH = 767
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`

export const TABLET_MIN_WIDTH = 768
export const TABLET_MAX_WIDTH = 1279
export const TABLET_QUERY = `(min-width: ${TABLET_MIN_WIDTH}px) and (max-width: ${TABLET_MAX_WIDTH}px)`

export const TABLET_PORTRAIT_MAX_WIDTH = 1023
export const TABLET_PORTRAIT_QUERY = `(min-width: ${TABLET_MIN_WIDTH}px) and (max-width: ${TABLET_PORTRAIT_MAX_WIDTH}px)`

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
    // The server has no viewport. CSS `md:max-lg` / `lg:max-xl` / `max-xl`
    // drive chrome; these hooks are behaviour only (overlay vs rail).
    () => false
  )
}

export function useIsMobile() {
  return useMediaQuery(PHONE_QUERY)
}

export function useIsTablet() {
  return useMediaQuery(TABLET_QUERY)
}

export function useIsTabletPortrait() {
  return useMediaQuery(TABLET_PORTRAIT_QUERY)
}
