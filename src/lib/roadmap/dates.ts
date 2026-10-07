/**
 * Roadmap-specific date helpers on top of the shared clock
 * (`@/lib/clock`): "signed N days ago" as an instant, and the target-window
 * labels the seed uses ("Q4 2026", "Nov 2026", "2027"). Relative age is the
 * shared `formatRelative`.
 *
 * Nothing here reads the clock; every helper takes the instant it should
 * work from (`shell.nowMs`). All calendar work goes through the shared
 * Central-day helpers, so day arithmetic is calendar days (DST-proof),
 * never 24-hour blocks.
 */
import { addDays, todayIn, type IsoDay } from "@/lib/clock"

/** The Central calendar day `nowMs` falls on. */
export function centralDay(nowMs: number): IsoDay {
  return todayIn(new Date(nowMs))
}

/**
 * An instant that is unambiguously *midday* on a Central calendar day:
 * 18:00 UTC is 13:00 CDT / 12:00 CST, never near midnight, so it formats to
 * the same day in Central and in UTC alike.
 */
export function middayInstant(day: IsoDay): string {
  return `${day}T18:00:00.000Z`
}

/** Midday on the Central day `days` calendar days before `nowMs`, as an ISO instant. */
export function signedDaysAgo(nowMs: number, days: number): string {
  return middayInstant(addDays(centralDay(nowMs), -days))
}

/* ------------------------------------------------- target-window labels */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function yearMonth(nowMs: number): [year: number, month: number] {
  const [y, m] = centralDay(nowMs).split("-").map(Number)
  return [y, m]
}

/** "Nov 2026" — the month `offset` months from the Central month of `nowMs`. */
export function monthLabel(nowMs: number, offset = 0): string {
  const [year, month] = yearMonth(nowMs)
  const index = year * 12 + (month - 1) + offset
  return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`
}

/** "Q4 2026" — the quarter `offset` quarters from the Central quarter of `nowMs`. */
export function quarterLabel(nowMs: number, offset = 0): string {
  const [year, month] = yearMonth(nowMs)
  const index = year * 4 + Math.floor((month - 1) / 3) + offset
  return `Q${(index % 4) + 1} ${Math.floor(index / 4)}`
}

/** "2027" — the year `offset` years from the Central year of `nowMs`. */
export function yearLabel(nowMs: number, offset = 0): string {
  return String(yearMonth(nowMs)[0] + offset)
}
