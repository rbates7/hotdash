/**
 * The clock for the Product Roadmap screen, kept local to this feature so it
 * never collides with other pages' helpers (`src/lib/clock.ts` belongs to
 * the Home PR).
 *
 * Time is read exactly once per request, in `page.tsx`, via `requestNow()`,
 * and passed down as a number (`nowMs`). Nothing below reads the clock:
 * every helper takes the instant it should work from. The seed is built
 * against that instant and every date on the page is formatted from a stored
 * ISO instant, always in Central time, so the server and the browser print
 * the same calendar day whatever zone they run in.
 *
 * Day arithmetic is done on Central *calendar days*, never by adding or
 * subtracting 24 hours, so a DST change can't shift a date by one.
 */

/** The single clock read. Called by the page, once per request. */
export function requestNow(): number {
  return Date.now()
}

/** Where the founder is. Every formatter in this file passes it as `timeZone`. */
export const CENTRAL = "America/Chicago"

const DAY_MS = 86_400_000

// Formatters are built on first use, not at import, so importing this module
// (on the server, in a test, in the browser) costs nothing until a date is
// actually printed.
let dayKeyFormat: Intl.DateTimeFormat | undefined

function getDayKeyFormat(): Intl.DateTimeFormat {
  dayKeyFormat ??= new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: CENTRAL,
  })
  return dayKeyFormat
}

/** A calendar date as seen from Central. `month` is 1–12. */
export type CentralDate = { year: number; month: number; day: number }

function toMs(instant: number | string | Date): number {
  return instant instanceof Date
    ? instant.getTime()
    : typeof instant === "string"
      ? Date.parse(instant)
      : instant
}

/** The Central calendar date an instant falls on. */
export function centralDate(instant: number | string | Date): CentralDate {
  const [year, month, day] = getDayKeyFormat()
    .format(new Date(toMs(instant)))
    .split("-")
    .map(Number)
  return { year, month, day }
}

/** "2026-10-07" for any instant, as seen from Central. */
export function dayKey(instant: number | string | Date): string {
  return getDayKeyFormat().format(new Date(toMs(instant)))
}

/** The Central calendar day as a whole number of days since the epoch. */
function dayNumber(instant: number | string | Date): number {
  const { year, month, day } = centralDate(instant)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/**
 * An instant that is unambiguously *midday* on the given Central calendar
 * date: 18:00 UTC is 13:00 CDT or 12:00 CST, never near midnight, so it
 * formats to the same day in Central and in UTC alike.
 */
export function centralMidday({ year, month, day }: CentralDate): number {
  return Date.UTC(year, month - 1, day, 18)
}

/**
 * Midday on the Central day `days` calendar days before `nowMs`. Calendar
 * arithmetic via `Date.UTC` day rollover, not `nowMs - days * 24h`, so a
 * DST change between the two dates can't produce an off-by-one.
 */
export function daysAgo(nowMs: number, days: number): number {
  const { year, month, day } = centralDate(nowMs)
  return centralMidday({ year, month, day: day - days })
}

/** Whole Central calendar days from `from` to `to` (positive when `to` is later). */
export function calendarDaysBetween(
  from: number | string | Date,
  to: number | string | Date
): number {
  return dayNumber(to) - dayNumber(from)
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * "7 Oct 2026" — the form the sibling boards print. Composed by hand from
 * the Central date because `en-GB` says "Sept" and `en-US` puts the day
 * last.
 */
export function formatDate(instant: number | string | Date): string {
  const { year, month, day } = centralDate(instant)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** "today", "yesterday", "5 days ago", "3 weeks ago"… relative to `nowMs`. */
export function relativeLabel(instant: number | string | Date, nowMs: number): string {
  const days = calendarDaysBetween(instant, nowMs)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

/* ------------------------------------------------- target-window labels */

/** "Nov 2026" — the month `offset` months from the Central month of `nowMs`. */
export function monthLabel(nowMs: number, offset = 0): string {
  const { year, month } = centralDate(nowMs)
  // Date.UTC normalises month overflow in both directions.
  const d = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "Q4 2026" — the quarter `offset` quarters from the Central quarter of `nowMs`. */
export function quarterLabel(nowMs: number, offset = 0): string {
  const { year, month } = centralDate(nowMs)
  const index = year * 4 + Math.floor((month - 1) / 3) + offset
  return `Q${(index % 4) + 1} ${Math.floor(index / 4)}`
}

/** "2027" — the year `offset` years from the Central year of `nowMs`. */
export function yearLabel(nowMs: number, offset = 0): string {
  return String(centralDate(nowMs).year + offset)
}
