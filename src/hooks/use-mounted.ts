import * as React from "react"

const noopSubscribe = () => () => {}

/**
 * False during SSR and the first client render, true afterwards. Use it to
 * defer rendering anything that depends on browser-only state.
 */
export function useMounted() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )
}
