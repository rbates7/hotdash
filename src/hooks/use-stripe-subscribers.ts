"use client"

import * as React from "react"

import {
  STRIPE_SUBSCRIBERS_PATH,
  parseSubscriberList,
  subscriberListReducer,
  subscriberListState,
  type SubscriberListFetch,
  type SubscriberListKind,
  type SubscriberListState,
  type SubscriberListView,
} from "@/lib/stripe-subscribers"
import { retryDelay, type Timers } from "@/lib/subscriber-source"
import { useSettings } from "@/hooks/use-settings"
import { CONNECTING_POLL_MS, SUMMARY_POLL_MS } from "@/hooks/use-stripe-summary"

/**
 * The browser's copy of `/api/stripe/subscribers?list=…`, one per list and
 * Settings zone, read only while its tab is open. Loading until the first
 * answer (and on the server); polls at the Stripe summary's pace; a 401
 * from the login gate is the session expired, and stops polling.
 */

export type SubscriberListFetcher = (list: SubscriberListKind, timeZone: string) => Promise<SubscriberListFetch>

export const fetchSubscriberList: SubscriberListFetcher = async (list, timeZone) => {
  try {
    const res = await fetch(`${STRIPE_SUBSCRIBERS_PATH}?list=${list}&tz=${encodeURIComponent(timeZone)}`, { cache: "no-store" })
    if (res.status === 401) return { kind: "unauthorized" }
    if (!res.ok) return { kind: "error" }
    const data = parseSubscriberList(await res.json(), list)
    return data ? { kind: "ok", data } : { kind: "error" }
  } catch {
    return { kind: "error" }
  }
}

const LOADING: SubscriberListView = { phase: "loading" }

export function subscriberListPollMs(view: SubscriberListView) {
  return view.phase === "ready" && view.list.status === "connecting" ? CONNECTING_POLL_MS : SUMMARY_POLL_MS
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export type SubscriberListStore = { getState(): SubscriberListView; subscribe(listener: () => void): () => void }

export function createSubscriberListStore(
  list: SubscriberListKind,
  timeZone: string,
  {
    fetcher = fetchSubscriberList,
    initial = LOADING,
    timers = globalTimers,
  }: { fetcher?: SubscriberListFetcher; initial?: SubscriberListView; timers?: Timers } = {}
): SubscriberListStore {
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
    const result = await fetcher(list, timeZone)
    if (mine !== generation || listeners.size === 0) return
    failures = result.kind === "error" ? failures + 1 : 0
    const next = subscriberListReducer(state, result, list)
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    // Signed out: nothing to poll until the founder signs in again (a reload).
    if (state.phase === "unauthorized") return
    schedule(failures > 0 ? retryDelay(failures) : subscriberListPollMs(state))
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

let options: { fetcher?: SubscriberListFetcher; initial?: SubscriberListView | ((list: SubscriberListKind) => SubscriberListView) } = {}
let stores = new Map<string, SubscriberListStore>()

/** Tests only: swap the fetcher and starting view, and forget every store. */
export function configureSubscriberLists(next: typeof options) {
  options = next
  stores = new Map()
}

const serverView = () => LOADING

export function useSubscriberListView(list: SubscriberListKind): SubscriberListView {
  const { timeZone } = useSettings()
  const key = `${list}|${timeZone}`
  let store = stores.get(key)
  if (!store) {
    const initial = typeof options.initial === "function" ? options.initial(list) : options.initial
    stores.set(key, (store = createSubscriberListStore(list, timeZone, { fetcher: options.fetcher, initial })))
  }
  return React.useSyncExternalStore(store.subscribe, store.getState, serverView)
}

export function useSubscriberList(list: SubscriberListKind): SubscriberListState {
  return subscriberListState(useSubscriberListView(list))
}
