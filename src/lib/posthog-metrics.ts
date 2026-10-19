import type { Rate } from "@/lib/stripe-metrics"

/**
 * Usage figures from PostHog, computed from what the read-only HogQL
 * queries return (`src/lib/server/posthog.ts`). Pure: no fetching here.
 *
 * What PostHog holds, and so what these can honestly say: **iOS app
 * events only, from June 2026** — nothing from the web app, nothing
 * earlier. A person is whoever PostHog counts as one (`person_id`), so a
 * coach on two phones who signed in on both is one person; someone who
 * never signed in is their own anonymous person.
 *
 * Windows are rolling 28 × 24 h, ending at PostHog's `now()` when the sync
 * ran — the same 28-day windows as every other Metrics card, but with no
 * time zone (the queries count by elapsed time, not by calendar day).
 * Window 0 is the latest; window 6 is the oldest the queries read.
 */

export const WINDOW_DAYS = 28
/** The card shows six windows, and Retention reads one more back for its base. */
export const SERIES_WINDOWS = 6
export const LOOKBACK_WINDOWS = SERIES_WINDOWS + 1
export const LOOKBACK_DAYS = WINDOW_DAYS * LOOKBACK_WINDOWS
const WINDOW_SEC = WINDOW_DAYS * 86_400
/**
 * A window counts as covered when PostHog's first event in the lookback is
 * no later than a day after the window starts (a quiet first hour is not
 * missing data). Earlier windows — before PostHog was set up — have no
 * figure, never a 0.
 */
const COVERAGE_SLACK_SEC = 86_400

/** What the server reads from PostHog — counts only, no person ids or properties. */
export type PosthogData = {
  /** PostHog's `now()` when the queries ran, unix seconds. */
  now: number
  /** The first event in the lookback, unix seconds; null when there is none. */
  earliest: number | null
  /**
   * Per window `w` (0 = latest): people with any event in it (`active`),
   * and how many of those also had one in the next, newer window
   * (`retained`; always 0 for window 0). Windows nobody was active in are
   * simply absent.
   */
  windows: { w: number; active: number; retained: number }[]
  /** People with any event in the last 24 h, and in the last 7 days. */
  recent: { day: number; week: number }
}

export type PosthogMetrics = {
  /**
   * People with any app event in the 28 days (`value`), the 28 before
   * (`previous`) and six windows oldest first. `day` and `week` are the
   * last 24 h and 7 days. Null where PostHog has no full window.
   */
  activeUsers: { value: number | null; previous: number | null; series: (number | null)[]; day: number; week: number }
  /**
   * Of the people active in the previous 28 days (`base`), the share also
   * active in the latest 28 (`retained`), in %. Null when that window is
   * not covered or nobody was in it.
   */
  retention: { value: Rate; previous: Rate; series: Rate[]; retained: number | null; base: number | null }
  /** The first event the queries saw (ISO), or null. */
  since: string | null
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

/** Throws on anything that is not a complete, sane reading. */
export function computePosthogMetrics(data: PosthogData): PosthogMetrics {
  const { now, earliest, windows, recent } = data
  if (!isCount(now) || now === 0) throw new Error("now")
  if (earliest !== null && (!isCount(earliest) || earliest > now)) throw new Error("earliest")
  if (!isCount(recent.day) || !isCount(recent.week) || recent.day > recent.week) throw new Error("recent")
  const byWindow = new Map<number, { active: number; retained: number }>()
  for (const row of windows) {
    if (!isCount(row.w) || row.w >= LOOKBACK_WINDOWS || byWindow.has(row.w)) throw new Error("window")
    if (!isCount(row.active) || !isCount(row.retained) || row.retained > row.active) throw new Error("window")
    byWindow.set(row.w, { active: row.active, retained: row.retained })
  }

  const covered = (w: number) => earliest !== null && earliest <= now - (w + 1) * WINDOW_SEC + COVERAGE_SLACK_SEC
  const active = (w: number) => (covered(w) ? (byWindow.get(w)?.active ?? 0) : null)
  /** Retention *into* window `w`: its base is the window before it, `w + 1`. */
  const retention = (w: number): Rate => {
    const base = active(w + 1)
    if (!base) return null
    return (byWindow.get(w + 1)!.retained / base) * 100
  }
  // Oldest first, ending on window 0.
  const ws = Array.from({ length: SERIES_WINDOWS }, (_, i) => SERIES_WINDOWS - 1 - i)
  return {
    activeUsers: {
      value: active(0),
      previous: active(1),
      series: ws.map(active),
      day: recent.day,
      week: recent.week,
    },
    retention: {
      value: retention(0),
      previous: retention(1),
      series: ws.map(retention),
      retained: covered(1) ? (byWindow.get(1)?.retained ?? 0) : null,
      base: active(1),
    },
    since: earliest === null ? null : new Date(earliest * 1000).toISOString(),
  }
}
