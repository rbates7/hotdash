/**
 * The clock for the Feature Request screen, kept local to this feature so
 * it never collides with other pages' helpers.
 *
 * `now()` is real time. The seed is generated against it ("2 days ago" is
 * two days before today, whatever today is) and every date on the board is
 * formatted from a stored ISO instant. Nothing is frozen.
 *
 * Tests pin time with `vi.useFakeTimers({ toFake: ["Date"] })` plus
 * `vi.setSystemTime()`, or pass a fixed `Date` straight to the helpers.
 */
export function now(): Date {
  return new Date()
}

/**
 * Where the founder is. Every formatter in this file passes it as
 * `timeZone`, so the server and the browser print the same calendar day
 * whatever machine or locale they run on.
 */
export const CENTRAL = "America/Chicago"

const DAY_MS = 86_400_000

/** "2026-08-24" for any instant, as seen from Central. The one formatter. */
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: CENTRAL,
})

/** `days` whole days before `from`, keeping the time of day. */
export function daysAgo(days: number, from: Date = now()): Date {
  return new Date(from.getTime() - days * DAY_MS)
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * "24 Aug 2026" — the format the mock prints on every card. Composed by
 * hand because `en-GB` says "Sept" and `en-US` puts the day last.
 */
export function formatDate(iso: string): string {
  const [y, m, d] = dayKeyFormat.format(new Date(iso)).split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** Calendar day in Central as a UTC-midnight epoch, for day arithmetic. */
function dayNumber(date: Date): number {
  const [y, m, d] = dayKeyFormat.format(date).split("-").map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Whole calendar days between `iso` and `from`, in Central. */
export function calendarDaysAgo(iso: string, from: Date = now()): number {
  return dayNumber(from) - dayNumber(new Date(iso))
}

/** "today", "yesterday", "5 days ago", "3 weeks ago"… relative to `from`. */
export function relativeLabel(iso: string, from: Date = now()): string {
  const days = calendarDaysAgo(iso, from)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}
