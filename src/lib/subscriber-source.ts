import { formatWallClock, now, todayIn } from "@/lib/clock"
import { snapshotFor } from "@/lib/kpis"

/**
 * Where the Home ticker's number comes from when Stripe is not connected:
 * the sample source below, behind one interface (the store polls every 60s
 * and backs off on failure). With Stripe connected the ticker reads the
 * shared Stripe summary instead (`useSubscriberTicker`).
 */

export type SubscriberReading = {
  /** Paying subscribers right now (see `isPaying`). */
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
  /** Hard-coded figures: the ticker wears the Sample data chip. */
  readonly sample: boolean
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

/* ---------------------------------------------------------------- sample */

/** A simulated sign-up lands this often, so the flaps can be seen. */
export const SAMPLE_CADENCE_MS = 20_000
/** Sign-ups per tick, cycled: mostly one, sometimes a burst. */
export const SAMPLE_PATTERN = [1, 1, 2, 1, 3, 1] as const

/**
 * The sample count at `at`, for a page that opened at `startMs`: the
 * Metrics page's own Subscribers figure (so Home's ticker and the truth
 * strip start on the same number), plus one simulated sign-up batch every
 * `SAMPLE_CADENCE_MS` since. "Today" counts the batches that landed since
 * 00:00 in `timeZone`. A pure function of time: every caller agrees.
 */
export function sampleReadingAt(
  startMs: number,
  at: Date,
  timeZone: string,
  base: number = sampleBase(at)
): SubscriberReading {
  const ticks = Math.max(0, Math.floor((at.getTime() - startMs) / SAMPLE_CADENCE_MS))
  const day = todayIn(at, timeZone)
  let total = base
  let today = 0
  for (let i = 0; i < ticks; i++) {
    const n = SAMPLE_PATTERN[i % SAMPLE_PATTERN.length]
    total += n
    if (todayIn(new Date(startMs + (i + 1) * SAMPLE_CADENCE_MS), timeZone) === day) today += n
  }
  return { total, today, at }
}

/** Metrics › Subscribers for the day `at` falls on. */
export function sampleBase(at: Date) {
  return snapshotFor("subscribers", { today: at }).value
}

/**
 * The sample source. Its clock starts when the module loads (the page
 * opened), and it pushes a change on every simulated sign-up while anyone
 * listens. `initial` is always the base figure — on the server too — and
 * the client's first read matches it, so nothing flaps on first paint.
 */
export function createSampleSource({
  startMs = now().getTime(),
  clock = now,
  timers = globalTimers,
}: {
  startMs?: number
  clock?: () => Date
  timers?: Timers
} = {}): SubscriberSource {
  const listeners = new Set<() => void>()
  let timer: unknown = null
  const arm = () => {
    const elapsed = clock().getTime() - startMs
    const wait = SAMPLE_CADENCE_MS - (((elapsed % SAMPLE_CADENCE_MS) + SAMPLE_CADENCE_MS) % SAMPLE_CADENCE_MS)
    timer = timers.setTimeout(() => {
      for (const l of listeners) l()
      arm()
    }, wait)
  }
  return {
    sample: true,
    // The page-open figure, wherever it is asked: the server's module has
    // been loaded far longer than this page has been open.
    initial: () => {
      const at = clock()
      return { total: sampleBase(at), today: 0, at }
    },
    read: async ({ timeZone }) => sampleReadingAt(startMs, clock(), timeZone),
    subscribe(onChange) {
      listeners.add(onChange)
      if (listeners.size === 1) arm()
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0 && timer !== null) {
          timers.clearTimeout(timer)
          timer = null
        }
      }
    },
  }
}
