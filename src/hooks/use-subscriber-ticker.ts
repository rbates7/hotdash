"use client"

import * as React from "react"

import {
  createSampleSource,
  createTickerStore,
  initialState,
  type SubscriberSource,
  type TickerState,
  type TickerStore,
} from "@/lib/subscriber-source"
import { useSettings } from "@/hooks/use-settings"

/** The ticker's source until Stripe is wired: swap this one line. */
export const subscriberSource: SubscriberSource = createSampleSource()

const stores = new WeakMap<SubscriberSource, Map<string, TickerStore>>()

function storeFor(source: SubscriberSource, timeZone: string) {
  let byZone = stores.get(source)
  if (!byZone) stores.set(source, (byZone = new Map()))
  let store = byZone.get(timeZone)
  if (!store) byZone.set(timeZone, (store = createTickerStore(source, { timeZone })))
  return store
}

/**
 * The live subscriber count for the founder's Settings zone, shared by
 * every ticker on the page. The server render (and hydration) use the
 * source's synchronous first reading, so the tiles paint settled.
 */
export function useSubscriberTicker(source: SubscriberSource = subscriberSource): {
  state: TickerState
  refresh: () => void
  sample: boolean
  timeZone: string
} {
  const { timeZone } = useSettings()
  const store = storeFor(source, timeZone)
  const [serverState] = React.useState(() => initialState(source, { timeZone }))
  const state = React.useSyncExternalStore(store.subscribe, store.getState, () => serverState)
  return { state, refresh: store.refresh, sample: source.sample, timeZone }
}
