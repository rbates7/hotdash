"use client"

import * as React from "react"

import {
  LOADING_STATE,
  createSampleSource,
  createTickerStore,
  initialState,
  type SubscriberSource,
  type TickerState,
  type TickerStore,
} from "@/lib/subscriber-source"
import { isAppStoreConnecting } from "@/lib/app-store-summary"
import { liveSubscribers, type SubscriberBreakdownView } from "@/lib/live-metrics"
import { breakdownText } from "@/lib/subscriber-total"
import { useSettings } from "@/hooks/use-settings"
import { useStripeFeed } from "@/hooks/use-stripe-summary"

/** The ticker's figures while Stripe is not connected. */
export const subscriberSource: SubscriberSource = createSampleSource()

const stores = new WeakMap<SubscriberSource, Map<string, TickerStore>>()

function storeFor(source: SubscriberSource, timeZone: string) {
  let byZone = stores.get(source)
  if (!byZone) stores.set(source, (byZone = new Map()))
  let store = byZone.get(timeZone)
  if (!store) byZone.set(timeZone, (store = createTickerStore(source, { timeZone })))
  return store
}

/** Stands in for the sample store while Stripe's figures are on screen. */
const IDLE: TickerStore = {
  getState: () => LOADING_STATE,
  subscribe: () => () => {},
  refresh: () => {},
}

/**
 * The subscriber count for the founder's Settings zone, shared by every
 * ticker on the page:
 *
 * - Stripe connected → the Subscribers total (`subscriberTotal`: Stripe
 *   paying + App Store + free accounts) and today's net change, as of the
 *   last sync, with its breakdown; stale → the same, marked stale.
 * - Stripe not connected → no count at all (`notConnected`), never the
 *   simulated sample source; the ticker says Not connected.
 * - Until the summary answers → the loading tiles (the server render too).
 *
 * Passing `source` pins the ticker to it (tests only; fixtures never reach
 * a real screen).
 */
export function useSubscriberTicker(source?: SubscriberSource): {
  state: TickerState
  refresh: () => void
  sample: boolean
  /** Stripe has no key: nothing to count, and the ticker says so. */
  notConnected: boolean
  timeZone: string
  /** The total's groups (live only), as rows and as one sentence. */
  breakdown: { view: SubscriberBreakdownView; text: string } | null
} {
  const { timeZone } = useSettings()
  const feed = useStripeFeed()
  const sampleSource = source ?? subscriberSource
  // Only a pinned source (tests) ever runs the simulated store.
  const useSample = Boolean(source)
  const store = useSample ? storeFor(sampleSource, timeZone) : IDLE
  const [serverState] = React.useState(() => (source ? initialState(source, { timeZone }) : LOADING_STATE))
  const sampleState = React.useSyncExternalStore(store.subscribe, store.getState, () => serverState)

  if (useSample) {
    return { state: sampleState, refresh: store.refresh, sample: sampleSource.sample, notConnected: false, timeZone, breakdown: null }
  }
  if (feed.kind === "not_connected") {
    return { state: LOADING_STATE, refresh: IDLE.refresh, sample: false, notConnected: true, timeZone, breakdown: null }
  }
  // Still connecting (Stripe, or App Store for its group): no total yet.
  if (feed.kind === "loading" || isAppStoreConnecting(feed.appStore)) {
    return { state: LOADING_STATE, refresh: IDLE.refresh, sample: false, notConnected: false, timeZone, breakdown: null }
  }
  const { total, breakdown } = liveSubscribers(feed, timeZone)
  const reading = { total: total.value, today: total.today, at: feed.lastSyncedAt }
  return {
    state: feed.stale ? { status: "stale", reading, failures: 1 } : { status: "ready", reading },
    refresh: IDLE.refresh,
    sample: false,
    notConnected: false,
    timeZone,
    breakdown: { view: breakdown, text: breakdownText(total, timeZone) },
  }
}
