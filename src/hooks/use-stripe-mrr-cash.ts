"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import {
  MRR_CASH_PATH,
  nextPollMs,
  onFetchFailure,
  parseMrrCashSummary,
  type MrrCashSummary,
  type MrrCashView,
} from "@/lib/stripe-mrr-cash"
import { useSettings } from "@/hooks/use-settings"

/**
 * The browser's copy of `/api/stripe/mrr-cash` for the founder's Settings
 * zone. Loading until the first answer (the server render too); polls every
 * 5 s while the server says `connecting`, then every 60 s; our endpoint
 * failing keeps the last figures as stale (or reads as not connected).
 */

export type MrrCashFetcher = (timeZone: string) => Promise<MrrCashSummary>

export const fetchMrrCash: MrrCashFetcher = async (timeZone) => {
  const res = await fetch(`${MRR_CASH_PATH}?tz=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`mrr-cash ${res.status}`)
  const summary = parseMrrCashSummary(await res.json())
  if (!summary) throw new Error("mrr-cash unreadable")
  return summary
}

const LOADING: MrrCashView = { phase: "loading" }

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export type MrrCashStore = { getState(): MrrCashView; subscribe(listener: () => void): () => void }

export function createMrrCashStore(
  timeZone: string,
  { fetcher = fetchMrrCash, timers = globalTimers }: { fetcher?: MrrCashFetcher; timers?: Timers } = {}
): MrrCashStore {
  let state = LOADING
  const listeners = new Set<() => void>()
  let timer: unknown = null
  let generation = 0
  let failures = 0

  const schedule = (ms: number) => {
    if (timer !== null) timers.clearTimeout(timer)
    timer = timers.setTimeout(() => {
      timer = null
      void read()
    }, ms)
  }
  const read = async () => {
    const mine = generation
    let next: MrrCashView
    let failed = false
    try {
      next = { phase: "ready", summary: await fetcher(timeZone) }
    } catch {
      failed = true
      next = onFetchFailure(state)
    }
    if (mine !== generation || listeners.size === 0) return
    failures = failed ? failures + 1 : 0
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failed ? retryDelay(failures) : nextPollMs(state))
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        generation += 1
        void read()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          generation += 1
          if (timer !== null) timers.clearTimeout(timer)
          timer = null
        }
      }
    },
  }
}

let stores = new Map<string, MrrCashStore>()
let options: { fetcher?: MrrCashFetcher } = {}

/** Tests only: swap the fetcher and forget every store. */
export function configureMrrCash(next: { fetcher?: MrrCashFetcher }) {
  options = next
  stores = new Map()
}

const serverView = () => LOADING

export function useMrrCashView(): MrrCashView {
  const { timeZone } = useSettings()
  let store = stores.get(timeZone)
  if (!store) stores.set(timeZone, (store = createMrrCashStore(timeZone, options)))
  return React.useSyncExternalStore(store.subscribe, store.getState, serverView)
}
