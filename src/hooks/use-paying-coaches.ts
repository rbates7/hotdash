"use client"

import * as React from "react"

import {
  PAYING_COACHES_PATH,
  PAYING_NOT_CONNECTED,
  parsePayingCoaches,
  type PayingCoachesSummary,
} from "@/lib/paying-coaches"

export const PAYING_POLL_MS = 60_000
export const PAYING_CONNECTING_POLL_MS = 5_000

/** Our endpoint unreachable: last counts become stale; with none, not connected. */
export function payingOnFailure(prev: PayingCoachesSummary | null): PayingCoachesSummary {
  if (prev && (prev.status === "connected" || prev.status === "stale")) return { ...prev, status: "stale" }
  return PAYING_NOT_CONNECTED
}

export async function fetchPaying(): Promise<PayingCoachesSummary> {
  const res = await fetch(PAYING_COACHES_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`paying ${res.status}`)
  const s = parsePayingCoaches(await res.json())
  if (!s) throw new Error("paying unreadable")
  return s
}

let defaultFetcher: () => Promise<PayingCoachesSummary> = fetchPaying

/** Tests: the fetcher every `usePayingCoaches()` uses (`null` puts the real one back). */
export function configurePayingCoaches(fetcher: (() => Promise<PayingCoachesSummary>) | null) {
  defaultFetcher = fetcher ?? fetchPaying
}

/** Null until the first answer (loading); polls while mounted. */
export function usePayingCoaches(override?: () => Promise<PayingCoachesSummary>) {
  const fetcher = override ?? defaultFetcher
  const [summary, setSummary] = React.useState<PayingCoachesSummary | null>(null)
  React.useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let last: PayingCoachesSummary | null = null
    const tick = async () => {
      let next: PayingCoachesSummary
      try {
        next = await fetcher()
      } catch {
        next = payingOnFailure(last)
      }
      if (!alive) return
      last = next
      setSummary(next)
      timer = setTimeout(tick, next.status === "connecting" ? PAYING_CONNECTING_POLL_MS : PAYING_POLL_MS)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [fetcher])
  return summary
}
