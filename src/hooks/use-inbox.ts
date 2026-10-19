"use client"

import * as React from "react"

import { retryDelay, type Timers } from "@/lib/subscriber-source"
import {
  INBOX_PATH,
  inboxPollMs,
  onInboxFailure,
  parseInboxResponse,
  type InboxResponse,
  type InboxView,
} from "@/lib/inbox-sources"

/**
 * The browser's copy of `/api/inbox`, shared by the Workplace Inbox and
 * Home's "Needs you" so they can never disagree. Loading until the first
 * answer; polls every 5 s while a source is connecting, then every 60 s.
 */

export type InboxFetcher = () => Promise<InboxResponse>

export const fetchInbox: InboxFetcher = async () => {
  const res = await fetch(INBOX_PATH, { cache: "no-store" })
  if (!res.ok) throw new Error(`inbox ${res.status}`)
  const inbox = parseInboxResponse(await res.json())
  if (!inbox) throw new Error("inbox unreadable")
  return inbox
}

const LOADING: InboxView = { phase: "loading" }

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export type InboxStore = { getState(): InboxView; subscribe(listener: () => void): () => void }

export function createInboxStore({
  fetcher = fetchInbox,
  timers = globalTimers,
  now = () => new Date(),
}: { fetcher?: InboxFetcher; timers?: Timers; now?: () => Date } = {}): InboxStore {
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
    let next: InboxView
    let failed = false
    try {
      next = { phase: "ready", inbox: await fetcher() }
    } catch {
      failed = true
      next = onInboxFailure(state, now())
    }
    if (mine !== generation || listeners.size === 0) return
    failures = failed ? failures + 1 : 0
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      for (const l of listeners) l()
    }
    schedule(failed ? retryDelay(failures) : inboxPollMs(state))
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

let store: InboxStore | null = null
let options: { fetcher?: InboxFetcher } = {}

/** Tests only: swap the fetcher and forget the store. */
export function configureInbox(next: { fetcher?: InboxFetcher }) {
  options = next
  store = null
}

/** The one store for this page, made on first use. */
function inboxStore(): InboxStore {
  if (!store) store = createInboxStore(options)
  return store
}

const serverView = () => LOADING

export function useInboxView(): InboxView {
  const s = inboxStore()
  return React.useSyncExternalStore(s.subscribe, s.getState, serverView)
}
