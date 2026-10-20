"use client"

import * as React from "react"

import { parseCrmSummary, toCrmThread } from "@/lib/crm/adapter"
import { GMAIL_SUMMARY_PATH } from "@/lib/crm/gmail-summary"
import { CRM_NOT_CONNECTED, type CrmFetchResult, type CrmMessage, type CrmSummary } from "@/lib/crm/types.ours"
import { retryDelay, type Timers } from "@/lib/subscriber-source"
import { GMAIL_POLL_MS } from "@/hooks/use-gmail-summary"
import { CONNECTING_POLL_MS } from "@/hooks/use-stripe-summary"

/**
 * The CRM screens' copy of `/api/crm/gmail`, in their own types (through
 * `@/lib/crm/adapter`), polled the way `use-gmail-summary` polls:
 *
 * - **loading** until the first answer (and on the server): skeletons and
 *   Connecting…, never rows that then swap;
 * - **ready** with the summary: `connecting` polls every
 *   `CONNECTING_POLL_MS`, everything else every `GMAIL_POLL_MS`;
 * - **unauthorized** on a 401 from the login gate: "Your session expired",
 *   never "Not connected". Polling stops; logging in again reloads the page;
 * - a failed or unreadable read keeps the last rows as `stale`; with none
 *   yet it reads as not connected (as Gmail's own store does).
 */

export type CrmView = { phase: "loading" } | { phase: "ready"; summary: CrmSummary } | { phase: "unauthorized" }

export const CRM_LOADING_VIEW: CrmView = { phase: "loading" }

export type CrmSummaryFetcher = () => Promise<CrmFetchResult<CrmSummary>>

export const fetchCrmSummary: CrmSummaryFetcher = async () => {
  try {
    const res = await fetch(GMAIL_SUMMARY_PATH, { cache: "no-store" })
    if (res.status === 401) return { kind: "unauthorized" }
    if (!res.ok) return { kind: "error" }
    const summary = parseCrmSummary(await res.json())
    return summary ? { kind: "ok", data: summary } : { kind: "error" }
  } catch {
    return { kind: "error" }
  }
}

export function crmReducer(view: CrmView, result: CrmFetchResult<CrmSummary>): CrmView {
  if (result.kind === "ok") return { phase: "ready", summary: result.data }
  if (result.kind === "unauthorized") return { phase: "unauthorized" }
  if (view.phase === "ready") {
    const { summary } = view
    if (summary.status === "connected" || summary.status === "stale") {
      return { phase: "ready", summary: { ...summary, status: "stale" } }
    }
    // Connecting was the server's word; unreachable, it is not known to be on its way.
    if (summary.status === "not_connected") return view
  }
  return { phase: "ready", summary: CRM_NOT_CONNECTED }
}

export function crmNextPollMs(view: CrmView) {
  return view.phase === "ready" && view.summary.status === "connecting" ? CONNECTING_POLL_MS : GMAIL_POLL_MS
}

export type CrmStore = { getState(): CrmView; subscribe(listener: () => void): () => void }

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export function createCrmStore({
  fetcher = fetchCrmSummary,
  initial = CRM_LOADING_VIEW,
  timers = globalTimers,
}: { fetcher?: CrmSummaryFetcher; initial?: CrmView; timers?: Timers } = {}): CrmStore {
  let state = initial
  const listeners = new Set<() => void>()
  let timer: unknown = null
  let generation = 0
  let failures = 0
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
    const result = await fetcher()
    if (mine !== generation || listeners.size === 0) return
    failures = result.kind === "error" ? failures + 1 : 0
    const next = crmReducer(state, result)
    const json = JSON.stringify(next)
    if (json !== lastJson) {
      lastJson = json
      state = next
      for (const l of listeners) l()
    }
    if (state.phase === "unauthorized") return
    schedule(failures > 0 ? retryDelay(failures) : crmNextPollMs(state))
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

let options: { fetcher?: CrmSummaryFetcher; initial?: CrmView; threadFetcher?: CrmThreadFetcher } = {}
let store: CrmStore | null = null

/** Tests (and only tests): swap the fetchers and the starting view. */
export function configureCrmSummary(next: typeof options) {
  options = next
  store = null
}

const serverView = () => CRM_LOADING_VIEW

export function useCrmView(): CrmView {
  store ??= createCrmStore(options)
  return React.useSyncExternalStore(store.subscribe, store.getState, serverView)
}

/* ---------------------------------------------------------------- thread */

export type CrmThreadFetcher = (caseId: string) => Promise<CrmFetchResult<CrmMessage[]>>

export const fetchCrmThread: CrmThreadFetcher = async (caseId) => {
  try {
    const res = await fetch(`${GMAIL_SUMMARY_PATH}?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" })
    if (res.status === 401) return { kind: "unauthorized" }
    if (!res.ok) return { kind: "error" }
    const messages = toCrmThread(await res.json(), caseId)
    return messages ? { kind: "ok", data: messages } : { kind: "error" }
  } catch {
    return { kind: "error" }
  }
}

export type CrmThreadView =
  | { phase: "loading" }
  | { phase: "ready"; messages: CrmMessage[] }
  | { phase: "unauthorized" }
  | { phase: "error" }

/** One case's messages, read when the panel opens it. */
export function useCrmThread(caseId: string | null): CrmThreadView {
  const [result, setResult] = React.useState<{ caseId: string; view: CrmThreadView } | null>(null)
  React.useEffect(() => {
    if (!caseId) return
    let live = true
    const fetcher = options.threadFetcher ?? fetchCrmThread
    void fetcher(caseId).then((r) => {
      if (!live) return
      const view: CrmThreadView = r.kind === "ok" ? { phase: "ready", messages: r.data } : { phase: r.kind }
      setResult({ caseId, view })
    })
    return () => {
      live = false
    }
  }, [caseId])
  return result && result.caseId === caseId ? result.view : { phase: "loading" }
}
