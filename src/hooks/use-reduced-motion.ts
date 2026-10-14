import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia?.(QUERY)
  mql?.addEventListener("change", onChange)
  return () => mql?.removeEventListener("change", onChange)
}

/**
 * True when the founder's OS asks for reduced motion. The server (and the
 * first client render) say true: nothing animates until the browser has
 * been asked, and a first paint never animates anyway.
 */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => true
  )
}
