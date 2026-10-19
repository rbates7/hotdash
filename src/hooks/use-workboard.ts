"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import { WORKBOARD_PATH, type WorkboardResponse } from "@/lib/workboard"
import {
  WORKBOARD_LOADING_VIEW,
  parseWorkboardResponse,
  workboardReducer,
  type WorkboardEvent,
  type WorkboardView,
} from "@/lib/workboard-view"

/**
 * The browser's copy of `/api/workboard`, one per page, the same shape as
 * the Notion roadmap hook (`use-notion-roadmap`):
 *
 * - **Loading** until the first answer (and on the server render): the
 *   board says Connecting…, never sample cards. A server that answers
 *   `connecting` (token set, first sync running) is polled every
 *   `WORKBOARD_CONNECTING_POLL_MS`.
 * - **Polls** every `WORKBOARD_POLL_MS` while the board is on screen (the
 *   server caches GitHub for 5 minutes, so this is cheap), backing off on
 *   failure.
 * - **Our own endpoint unreachable** keeps the last rows and marks them
 *   stale; with none yet, it reads as not connected.
 */

export const WORKBOARD_POLL_MS = 60_000
export const WORKBOARD_CONNECTING_POLL_MS = 5_000

export type WorkboardFetcher = () => Promise<WorkboardResponse>

export const fetchWorkboard: WorkboardFetcher = async () => {
  const res = await fetch(WORKBOARD_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`workboard ${res.status}`)
  const summary = parseWorkboardResponse(await res.json())
  if (!summary) throw new Error("workboard unreadable")
  return summary
}

export type WorkboardStore = {
  getState(): WorkboardView
  subscribe(listener: () => void): () => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

const isConnecting = (view: WorkboardView) => view.phase === "ready" && view.summary.status === "connecting"

export function createWorkboardStore({
  fetcher = fetchWorkboard,
  initial = WORKBOARD_LOADING_VIEW,
  timers = globalTimers,
}: {
  fetcher?: WorkboardFetcher
  initial?: WorkboardView
  timers?: Timers
} = {}): WorkboardStore {
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
    let event: WorkboardEvent
    try {
      event = { type: "summary", summary: await fetcher() }
    } catch {
      event = { type: "failure" }
    }
    if (mine !== generation || listeners.size === 0) return
    failures = event.type === "failure" ? failures + 1 : 0
    const next = workboardReducer(state, event)
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failures > 0 ? retryDelay(failures) : isConnecting(state) ? WORKBOARD_CONNECTING_POLL_MS : WORKBOARD_POLL_MS)
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

let options: { fetcher?: WorkboardFetcher; initial?: WorkboardView } = {}
let store: WorkboardStore | null = null

function theStore() {
  return (store ??= createWorkboardStore(options))
}

/**
 * Tests (and only tests): swap the fetcher and the starting view, and
 * forget the store. The test setup starts each test not connected.
 */
export function configureWorkboard(next: { fetcher?: WorkboardFetcher; initial?: WorkboardView }) {
  options = next
  store = null
}

const serverView = () => WORKBOARD_LOADING_VIEW

export function useWorkboardView(): WorkboardView {
  const s = theStore()
  return React.useSyncExternalStore(s.subscribe, s.getState, serverView)
}
