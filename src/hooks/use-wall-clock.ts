"use client"

import * as React from "react"

import { formatWallClock, now } from "@/lib/clock"

/**
 * The live wall clock in `timeZone` ("Tue, Oct 13 · 9:41 PM PDT"), or null
 * until mounted: it is browser-only, since the server's minute would differ
 * from the client's and hydration would mismatch. Ticks every 30 seconds.
 */
export function useWallClock(timeZone: string) {
  const [instant, setInstant] = React.useState<Date | null>(null)
  React.useEffect(() => {
    const tick = () => setInstant(now())
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])
  return instant ? formatWallClock(instant, timeZone) : null
}
