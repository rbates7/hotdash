import { formatWallClock } from "@/lib/clock"

/**
 * The Home ticker's source interface and store policy (poll every 60s,
 * back off on failure). The app's ticker reads the shared Stripe summary
 * (`useSubscriberTicker`) and says Not connected without a key. No
 * simulated count ships: the sample source tests pin (`SubscriberTicker`'s
 * `source` prop) lives in `@/lib/subscriber-source-fixture`.
 */

export type SubscriberReading = {
  /** Subscribers right now: the total (see `subscriberTotal`). */
  total: number
  /** Net change since 00:00 in the founder's time zone. */
  today: number
  /** When the source measured it. */
  at: Date
}

export type SubscriberQuery = {
  /** The founder's Settings zone: "today" starts at 00:00 here. */
  timeZone: string
}

export interface SubscriberSource {
  /**
   * A reading available synchronously, for the server render and hydration,
   * or null (a network source) so the ticker starts in its loading state.
   */
  initial(query: SubscriberQuery): SubscriberReading | null
  /** The current count. Rejects when the source cannot be reached. */
  read(query: SubscriberQuery): Promise<SubscriberReading>
  /** Optional push: `onChange` fires when the count may have moved. */
  subscribe?(onChange: () => void): () => void
}

/* --------------------------------------------------------------- policy */

/** Poll cadence when nothing is pushed. */
export const POLL_MS = 60_000
/** Retry after a failed read: 15s, 30s, then every 60s. */
export const RETRY_MS = [15_000, 30_000, 60_000] as const

/** Delay before retry number `failures` (1-based). */
export function retryDelay(failures: number) {
  return RETRY_MS[Math.min(Math.max(failures, 1), RETRY_MS.length) - 1]
}

/* ----------------------------------------------------------------- state */

export type TickerState =
  | { status: "loading" }
  /** Never had a good value: en-dash tiles and the error dot, never a 0. */
  | { status: "error"; failures: number }
  | { status: "ready"; reading: SubscriberReading }
  /** A refresh failed after a good value: keep it, say how old it is. */
  | { status: "stale"; reading: SubscriberReading; failures: number }

export type TickerEvent =
  | { type: "reading"; reading: SubscriberReading }
  | { type: "failure" }

export const LOADING_STATE: TickerState = { status: "loading" }

export function tickerReducer(state: TickerState, event: TickerEvent): TickerState {
  if (event.type === "reading") return { status: "ready", reading: event.reading }
  switch (state.status) {
    case "loading":
      return { status: "error", failures: 1 }
    case "error":
      return { status: "error", failures: state.failures + 1 }
    case "ready":
      return { status: "stale", reading: state.reading, failures: 1 }
    case "stale":
      return { ...state, failures: state.failures + 1 }
  }
}

export function initialState(source: SubscriberSource, query: SubscriberQuery): TickerState {
  const reading = source.initial(query)
  return reading ? { status: "ready", reading } : LOADING_STATE
}

/** Failures so far (0 when the last read was good). */
export function failuresOf(state: TickerState) {
  return state.status === "error" || state.status === "stale" ? state.failures : 0
}

/**
 * "Last updated 9:41 AM CDT" for a stale value — the time part of the
 * shared `formatWallClock`, in the founder's Settings zone (the same words
 * every stale Stripe figure uses).
 */
export function staleLabel(at: Date, timeZone: string) {
  const full = formatWallClock(at, timeZone)
  return `Last updated ${full.split(" · ")[1] ?? full}`
}

/* ----------------------------------------------------------------- store */

export type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
}

export type TickerStore = {
  getState(): TickerState
  subscribe(listener: () => void): () => void
  /** Read now (the error dot's Retry). */
  refresh(): void
}

/**
 * One watcher per source and zone, shared by every ticker on the page (the
 * phone bar and the Home header) so they can never disagree. It reads only
 * while something is listening: a read on start, on every push, and every
 * `POLL_MS`; a failure retries on the `RETRY_MS` backoff instead.
 */
export function createTickerStore(
  source: SubscriberSource,
  query: SubscriberQuery,
  timers: Timers = globalTimers
): TickerStore {
  let state = initialState(source, query)
  const listeners = new Set<() => void>()
  let timer: unknown = null
  let stopPush: (() => void) | null = null
  let generation = 0

  const emit = () => {
    for (const l of listeners) l()
  }
  const schedule = (ms: number) => {
    if (timer !== null) timers.clearTimeout(timer)
    timer = timers.setTimeout(() => {
      timer = null
      void read()
    }, ms)
  }
  const read = async () => {
    const mine = generation
    let event: TickerEvent
    try {
      event = { type: "reading", reading: await source.read(query) }
    } catch {
      event = { type: "failure" }
    }
    // Stopped (or restarted) while the read was in flight.
    if (mine !== generation || listeners.size === 0) return
    const next = tickerReducer(state, event)
    const same =
      event.type === "reading" &&
      state.status === "ready" &&
      state.reading.total === event.reading.total &&
      state.reading.today === event.reading.today
    if (!same) {
      state = next
      emit()
    }
    const failures = failuresOf(next)
    schedule(failures > 0 ? retryDelay(failures) : POLL_MS)
  }
  const start = () => {
    generation += 1
    stopPush = source.subscribe?.(() => void read()) ?? null
    void read()
  }
  const stop = () => {
    generation += 1
    stopPush?.()
    stopPush = null
    if (timer !== null) timers.clearTimeout(timer)
    timer = null
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    refresh() {
      if (listeners.size > 0) void read()
    },
  }
}
