"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import {
  POSTHOG_NOT_CONNECTED,
  POSTHOG_SUMMARY_PATH,
  parsePosthogSummary,
  posthogFeedOf,
  type PosthogFeed,
  type PosthogSummary,
  type PosthogView,
} from "@/lib/posthog-summary"

/**
 * The browser's copy of `/api/posthog/summary`, shared by every screen —
 * the same rules as Stripe's (`use-stripe-summary`), one store rather than
 * one per zone (PostHog's windows have no time zone):
 *
 * - **Loading** until the first answer (the server render too).
 * - **Polls** every `POSTHOG_POLL_MS` while anything listens, backing off
 *   on failure (the server caches PostHog for 5 minutes).
 * - **Our own endpoint unreachable** keeps the last figures as stale; with
 *   none yet, it reads as not connected (sample, labelled).
 */

export const POSTHOG_LOADING_VIEW: PosthogView = { phase: "loading" }

export const POSTHOG_POLL_MS = 60_000

export type PosthogFetcher = () => Promise<PosthogSummary>

export const fetchPosthogSummary: PosthogFetcher = async () => {
  const res = await fetch(POSTHOG_SUMMARY_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`posthog summary ${res.status}`)
  const summary = parsePosthogSummary(await res.json())
  if (!summary) throw new Error("posthog summary unreadable")
  return summary
}

export type PosthogEvent = { type: "summary"; summary: PosthogSummary } | { type: "failure" }

export function posthogReducer(view: PosthogView, event: PosthogEvent): PosthogView {
  if (event.type === "summary") return { phase: "ready", summary: event.summary }
  if (view.phase === "ready" && view.summary.metrics) {
    return { phase: "ready", summary: { ...view.summary, status: "stale" } }
  }
  return view.phase === "ready" ? view : { phase: "ready", summary: POSTHOG_NOT_CONNECTED }
}

export type PosthogStore = {
  getState(): PosthogView
  subscribe(listener: () => void): () => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createPosthogStore({
  fetcher = fetchPosthogSummary,
  initial = POSTHOG_LOADING_VIEW,
  timers = globalTimers,
}: {
  fetcher?: PosthogFetcher
  initial?: PosthogView
  timers?: Timers
} = {}): PosthogStore {
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
    let event: PosthogEvent
    try {
      event = { type: "summary", summary: await fetcher() }
    } catch {
      event = { type: "failure" }
    }
    if (mine !== generation || listeners.size === 0) return
    failures = event.type === "failure" ? failures + 1 : 0
    const next = posthogReducer(state, event)
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failures > 0 ? retryDelay(failures) : POSTHOG_POLL_MS)
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

let options: { fetcher?: PosthogFetcher; initial?: PosthogView } = {}
let store: PosthogStore | null = null

/**
 * Tests (and only tests): swap the fetcher and the starting view, and
 * forget the store. The test setup starts each test not connected.
 */
export function configurePosthogSummary(next: { fetcher?: PosthogFetcher; initial?: PosthogView }) {
  options = next
  store = null
}

function theStore() {
  return (store ??= createPosthogStore(options))
}

const serverView = () => POSTHOG_LOADING_VIEW

export function usePosthogView(): PosthogView {
  const s = theStore()
  return React.useSyncExternalStore(s.subscribe, s.getState, serverView)
}

/* ------------------------------------------------------- what screens use */

export function usePosthogFeed(): PosthogFeed {
  return posthogFeedOf(usePosthogView())
}
