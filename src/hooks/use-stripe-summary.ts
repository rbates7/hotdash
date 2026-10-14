"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import {
  NOT_CONNECTED,
  STRIPE_SUMMARY_PATH,
  feedOf,
  parseStripeSummary,
  type StripeFeed,
  type StripeSummary,
  type StripeView,
} from "@/lib/stripe-summary"
import { useSettings } from "@/hooks/use-settings"

/**
 * The browser's copy of `/api/stripe/summary`, one per Settings zone,
 * shared by every screen and the ticker so they can never disagree.
 *
 * - **Loading** until the first answer (the server render too): Stripe
 *   tiles show a placeholder, never a sample number that then swaps.
 * - **Polls** every `SUMMARY_POLL_MS` while anything listens (the server
 *   caches Stripe for 5 minutes, so this is cheap), backing off on failure.
 * - **Our own endpoint unreachable** keeps the last figures and marks them
 *   stale; with none yet, it reads as not connected (sample, labelled).
 */

export type { StripeView }

export const LOADING_VIEW: StripeView = { phase: "loading" }

export const SUMMARY_POLL_MS = 60_000

export type SummaryFetcher = (timeZone: string) => Promise<StripeSummary>

export const fetchSummary: SummaryFetcher = async (timeZone) => {
  const res = await fetch(`${STRIPE_SUMMARY_PATH}?tz=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`summary ${res.status}`)
  const summary = parseStripeSummary(await res.json())
  if (!summary) throw new Error("summary unreadable")
  return summary
}

export type SummaryEvent = { type: "summary"; summary: StripeSummary } | { type: "failure" }

export function summaryReducer(view: StripeView, event: SummaryEvent): StripeView {
  if (event.type === "summary") return { phase: "ready", summary: event.summary }
  if (view.phase === "ready" && view.summary.metrics) {
    return { phase: "ready", summary: { ...view.summary, status: "stale" } }
  }
  return view.phase === "ready" ? view : { phase: "ready", summary: NOT_CONNECTED }
}

export type SummaryStore = {
  getState(): StripeView
  subscribe(listener: () => void): () => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createSummaryStore(
  timeZone: string,
  { fetcher = fetchSummary, initial = LOADING_VIEW, timers = globalTimers }: {
    fetcher?: SummaryFetcher
    initial?: StripeView
    timers?: Timers
  } = {}
): SummaryStore {
  let state = initial
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
    let event: SummaryEvent
    try {
      event = { type: "summary", summary: await fetcher(timeZone) }
    } catch {
      event = { type: "failure" }
    }
    if (mine !== generation || listeners.size === 0) return
    failures = event.type === "failure" ? failures + 1 : 0
    const next = summaryReducer(state, event)
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failures > 0 ? retryDelay(failures) : SUMMARY_POLL_MS)
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

/* -------------------------------------------------------------- registry */

let options: { fetcher?: SummaryFetcher; initial?: StripeView } = {}
let stores = new Map<string, SummaryStore>()

function storeFor(timeZone: string) {
  let store = stores.get(timeZone)
  if (!store) stores.set(timeZone, (store = createSummaryStore(timeZone, options)))
  return store
}

/**
 * Tests (and only tests): swap the fetcher and the starting view, and
 * forget every store. The test setup starts each test not connected.
 */
export function configureStripeSummary(next: { fetcher?: SummaryFetcher; initial?: StripeView }) {
  options = next
  stores = new Map()
}

const serverView = () => LOADING_VIEW

/** The Stripe view for the founder's Settings zone. */
export function useStripeView(): StripeView {
  const { timeZone } = useSettings()
  const store = storeFor(timeZone)
  return React.useSyncExternalStore(store.subscribe, store.getState, serverView)
}

/* ------------------------------------------------------- what screens use */

export function useStripeFeed(): StripeFeed {
  return feedOf(useStripeView())
}
