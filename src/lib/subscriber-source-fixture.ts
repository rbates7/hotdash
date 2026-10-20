import { now, todayIn } from "@/lib/clock"
import { snapshotFor } from "@/lib/kpis-fixture"
import type { SubscriberReading, SubscriberSource, Timers } from "@/lib/subscriber-source"

/**
 * TESTS ONLY: a simulated subscriber source that counts up from the old
 * invented Metrics figure, so the ticker's tiles can be driven in tests.
 * The app never creates one (Rashad's Oct 16 rule).
 */

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}


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
