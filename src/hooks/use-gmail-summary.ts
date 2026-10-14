"use client"

import * as React from "react"

import {
  GMAIL_NOT_CONNECTED,
  GMAIL_SUMMARY_PATH,
  gmailFeedOf,
  parseGmailSummary,
  type GmailFeed,
  type GmailSummary,
  type GmailView,
} from "@/lib/crm/gmail-summary"
import { retryDelay, type Timers } from "@/lib/subscriber-source"

/**
 * The browser's copy of `/api/crm/gmail`, shared by every CRM screen and
 * Settings › Connected data, the same way `useStripeView` is:
 *
 * - **Loading** until the first answer (the server render too): the CRM
 *   shows its skeletons, never sample rows that then swap for real ones.
 * - **Polls** every `GMAIL_POLL_MS` while anything listens (the server
 *   caches Gmail for 5 minutes, so this is cheap), backing off on failure.
 * - **Our own endpoint unreachable** keeps the last threads and marks them
 *   stale; with none yet, it reads as not connected (sample, labelled).
 */

export const GMAIL_LOADING_VIEW: GmailView = { phase: "loading" }

export const GMAIL_POLL_MS = 60_000

export type GmailFetcher = () => Promise<GmailSummary>

export const fetchGmailSummary: GmailFetcher = async () => {
  const res = await fetch(GMAIL_SUMMARY_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`gmail ${res.status}`)
  const summary = parseGmailSummary(await res.json())
  if (!summary) throw new Error("gmail unreadable")
  return summary
}

export type GmailEvent = { type: "summary"; summary: GmailSummary } | { type: "failure" }

export function gmailReducer(view: GmailView, event: GmailEvent): GmailView {
  if (event.type === "summary") return { phase: "ready", summary: event.summary }
  if (view.phase === "ready" && view.summary.data) {
    return { phase: "ready", summary: { ...view.summary, status: "stale" } }
  }
  return view.phase === "ready" ? view : { phase: "ready", summary: GMAIL_NOT_CONNECTED }
}

export type GmailStore = {
  getState(): GmailView
  subscribe(listener: () => void): () => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createGmailStore({
  fetcher = fetchGmailSummary,
  initial = GMAIL_LOADING_VIEW,
  timers = globalTimers,
}: { fetcher?: GmailFetcher; initial?: GmailView; timers?: Timers } = {}): GmailStore {
  let state = initial
  const listeners = new Set<() => void>()
  let timer: unknown = null
  let generation = 0
  let failures = 0
  /** The last body applied, so an unchanged poll does not re-render the CRM. */
  let lastJson = ""

  const schedule = (ms: number) => {
    if (timer !== null) timers.clearTimeout(timer)
    timer = timers.setTimeout(() => {
      timer = null
      void read()
    }, ms)
  }
  const read = async () => {
    const mine = generation
    let event: GmailEvent
    try {
      event = { type: "summary", summary: await fetcher() }
    } catch {
      event = { type: "failure" }
    }
    if (mine !== generation || listeners.size === 0) return
    failures = event.type === "failure" ? failures + 1 : 0
    const next = gmailReducer(state, event)
    const json = JSON.stringify(next)
    if (json !== lastJson) {
      lastJson = json
      state = next
      for (const l of listeners) l()
    }
    schedule(failures > 0 ? retryDelay(failures) : GMAIL_POLL_MS)
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        generation += 1
        if (!lastJson) lastJson = JSON.stringify(state)
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

let options: { fetcher?: GmailFetcher; initial?: GmailView } = {}
let store: GmailStore | null = null

/**
 * Tests (and only tests): swap the fetcher and the starting view, and
 * forget the store. The test setup starts each test not connected.
 */
export function configureGmailSummary(next: { fetcher?: GmailFetcher; initial?: GmailView }) {
  options = next
  store = null
}

const serverView = () => GMAIL_LOADING_VIEW

export function useGmailView(): GmailView {
  store ??= createGmailStore(options)
  return React.useSyncExternalStore(store.subscribe, store.getState, serverView)
}

export function useGmailFeed(): GmailFeed {
  const view = useGmailView()
  return React.useMemo(() => gmailFeedOf(view), [view])
}
