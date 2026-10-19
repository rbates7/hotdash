"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import {
  NOTION_NOT_CONNECTED,
  NOTION_ROADMAP_PATH,
  notionFeedOf,
  parseNotionRoadmapSummary,
  type NotionRoadmapFeed,
  type NotionRoadmapSummary,
  type NotionRoadmapView,
} from "@/lib/notion-roadmap"

/**
 * The browser's copy of `/api/notion/roadmap`, one for the page, shared by
 * the Roadmap and Settings so they can never disagree. The same shape as
 * the Stripe summary hook (`use-stripe-summary`):
 *
 * - **Loading** until the first answer (the server render too): the board
 *   shows its skeleton, never sample bets. A server that answers
 *   `connecting` (token set, first sync running) keeps it loading, with
 *   "Connecting to Notion…", polled every `CONNECTING_POLL_MS`.
 * - **Polls** every `ROADMAP_POLL_MS` while anything listens (the server
 *   caches Notion for 5 minutes, so this is cheap), backing off on failure.
 * - **Our own endpoint unreachable** keeps the last rows and marks them
 *   stale; with none yet, it reads as not connected (no bets).
 */

export const NOTION_LOADING_VIEW: NotionRoadmapView = { phase: "loading" }

export const ROADMAP_POLL_MS = 60_000

/** While the server is connecting: soon enough that the rows appear about when the first sync lands. */
export const CONNECTING_POLL_MS = 5_000

const isConnecting = (view: NotionRoadmapView) => view.phase === "ready" && view.summary.status === "connecting"

export type RoadmapFetcher = () => Promise<NotionRoadmapSummary>

export const fetchRoadmap: RoadmapFetcher = async () => {
  const res = await fetch(NOTION_ROADMAP_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`roadmap ${res.status}`)
  const summary = parseNotionRoadmapSummary(await res.json())
  if (!summary) throw new Error("roadmap unreadable")
  return summary
}

export type RoadmapEvent = { type: "summary"; summary: NotionRoadmapSummary } | { type: "failure" }

export function roadmapReducer(view: NotionRoadmapView, event: RoadmapEvent): NotionRoadmapView {
  if (event.type === "summary") return { phase: "ready", summary: event.summary }
  if (view.phase === "ready" && view.summary.roadmap) {
    return { phase: "ready", summary: { ...view.summary, status: "stale" } }
  }
  // Connecting was the server's word; with the server unreachable it is no
  // longer known to be on its way, so it reads as not connected.
  if (view.phase === "ready" && view.summary.status !== "connecting") return view
  return { phase: "ready", summary: NOTION_NOT_CONNECTED }
}

export type RoadmapStore = {
  getState(): NotionRoadmapView
  subscribe(listener: () => void): () => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createRoadmapStore({
  fetcher = fetchRoadmap,
  initial = NOTION_LOADING_VIEW,
  timers = globalTimers,
}: {
  fetcher?: RoadmapFetcher
  initial?: NotionRoadmapView
  timers?: Timers
} = {}): RoadmapStore {
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
    let event: RoadmapEvent
    try {
      event = { type: "summary", summary: await fetcher() }
    } catch {
      event = { type: "failure" }
    }
    if (mine !== generation || listeners.size === 0) return
    failures = event.type === "failure" ? failures + 1 : 0
    const next = roadmapReducer(state, event)
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failures > 0 ? retryDelay(failures) : isConnecting(state) ? CONNECTING_POLL_MS : ROADMAP_POLL_MS)
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

let options: { fetcher?: RoadmapFetcher; initial?: NotionRoadmapView } = {}
let store: RoadmapStore | null = null

function theStore() {
  return (store ??= createRoadmapStore(options))
}

/**
 * Tests (and only tests): swap the fetcher and the starting view, and
 * forget the store. The test setup starts each test not connected.
 */
export function configureNotionRoadmap(next: { fetcher?: RoadmapFetcher; initial?: NotionRoadmapView }) {
  options = next
  store = null
}

const serverView = () => NOTION_LOADING_VIEW

export function useNotionRoadmapView(): NotionRoadmapView {
  const s = theStore()
  return React.useSyncExternalStore(s.subscribe, s.getState, serverView)
}

/** What the Roadmap and Settings use. */
export function useNotionRoadmapFeed(): NotionRoadmapFeed {
  return notionFeedOf(useNotionRoadmapView())
}
