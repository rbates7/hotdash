/**
 * Date maths for the Feature Request screen. Pure: nothing here reads the
 * clock. The instant "now" is read once per request in the page
 * (`src/lib/clock.ts` → `now()`), handed down as `nowMs`, and passed into
 * these helpers explicitly, so server HTML and client hydration agree.
 *
 * Every calculation is in calendar days as seen from Central
 * (`CENTRAL`, shared with Home), never in 24-hour blocks, so a DST change
 * cannot shift a card onto the wrong day.
 */
import { CENTRAL } from "@/lib/clock"

const DAY_MS = 86_400_000

/** Wall-clock fields of an instant in Central. */
export type Wall = {
  y: number
  m: number
  d: number
  h: number
  min: number
  s: number
}

// Formatters are built on first use, not at import, so a test can set
// process.env.TZ and re-import without a stale instance.
let partsFormat: Intl.DateTimeFormat | undefined
function parts(): Intl.DateTimeFormat {
  return (partsFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }))
}

export function centralWall(date: Date): Wall {
  const p: Record<string, number> = {}
  for (const part of parts().formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value)
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute, s: p.second }
}

const wallAsUtc = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s)

/**
 * The instant at which Central shows `wall`. Fields may overflow (day 0,
 * day 35…) and are normalised the way `Date.UTC` does. Two correction passes
 * absorb a DST offset change between the guess and the answer.
 */
export function instantAtCentralWall(wall: Wall): Date {
  const target = wallAsUtc(wall)
  let t = target
  for (let i = 0; i < 2; i++) {
    t += target - wallAsUtc(centralWall(new Date(t)))
  }
  return new Date(t)
}

/** Same Central wall-clock time, `days` calendar days earlier. */
export function calendarDaysBefore(days: number, from: Date): Date {
  const w = centralWall(from)
  return instantAtCentralWall({ ...w, d: w.d - days })
}

/** Central calendar day as a day count, for differences. */
function dayNumber(date: Date): number {
  const w = centralWall(date)
  return Date.UTC(w.y, w.m - 1, w.d) / DAY_MS
}

/** Whole Central calendar days from `iso` to `now`; negative if `iso` is later. */
export function calendarDaysAgo(iso: string, now: Date): number {
  return dayNumber(now) - dayNumber(new Date(iso))
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
  const w = centralWall(new Date(iso))
  return `${w.d} ${MONTHS[w.m - 1]} ${w.y}`
}

/** "today", "yesterday", "5 days ago", "3 weeks ago"… relative to `now`. */
export function relativeLabel(iso: string, now: Date): string {
  const days = calendarDaysAgo(iso, now)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}
