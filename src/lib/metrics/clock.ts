/**
 * Metrics' clock. Local to this page on purpose: Home (#9) adds a shared
 * `src/lib/clock.ts`; the two get consolidated once both land.
 *
 * The rule: real time, read **once per request** on the server (`now()` in
 * the page) and passed down as a calendar day, so SSR and hydration agree
 * and no component ever reads the machine clock itself. Everything
 * date-relative — the reporting period, seed rows, chart months, the
 * default date on a new expense — derives from that one day.
 */

/** The founder's calendar. Days roll over at Chicago midnight, not UTC. */
export const TIME_ZONE = "America/Chicago"

/** The real clock. Call it once per request; pass the result down. */
export function now(): Date {
  return new Date()
}

/** YYYY-MM-DD, a calendar date with no time or zone attached. */
export type IsoDay = string

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** The calendar day an instant falls on in `TIME_ZONE`. */
export function todayIn(instant: Date, timeZone = TIME_ZONE): IsoDay {
  const fmt =
    timeZone === TIME_ZONE
      ? DAY_PARTS
      : new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
  // en-CA formats as YYYY-MM-DD already.
  return fmt.format(instant)
}

/** Shift a calendar day by whole days. Done in UTC so DST cannot skew it. */
export function addDays(day: IsoDay, days: number): IsoDay {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export type Period = { start: IsoDay; end: IsoDay }

/** The reporting window: the trailing four weeks (28 days) ending `today`. */
export function periodEnding(today: IsoDay): Period {
  return { start: addDays(today, -27), end: today }
}

// Hand-rolled rather than Intl: newer ICU data prints "Sept" for en-GB and
// the mock (and the rest of the dashboard) use three-letter months.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function parts(day: IsoDay): [y: number, m: number, d: number] | null {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return null
  return [y, m, d]
}

/** "2026-08-18" → "18 Aug 2026". */
export function formatDate(day: IsoDay) {
  const p = parts(day)
  if (!p) return day
  const [y, m, d] = p
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/**
 * "25 Jul – 21 Aug 2026"; the year appears once when both ends share it,
 * otherwise on both: "25 Dec 2025 – 21 Jan 2026".
 */
export function formatPeriod({ start, end }: Period) {
  const ps = parts(start)
  const pe = parts(end)
  if (!ps || !pe) return `${start} – ${end}`
  const startText =
    ps[0] === pe[0] ? `${ps[2]} ${MONTHS[ps[1] - 1]}` : formatDate(start)
  return `${startText} – ${formatDate(end)}`
}

export type MonthLabel = { label: string; year: number }

/** The `count` calendar months ending in `today`'s month, oldest first. */
export function monthsEnding(today: IsoDay, count: number): MonthLabel[] {
  const p = parts(today)
  if (!p) return []
  const [y, m] = p
  const out: MonthLabel[] = []
  for (let i = count - 1; i >= 0; i--) {
    // Zero-based month arithmetic; negative values wrap to the prior year.
    const idx = m - 1 - i
    const year = y + Math.floor(idx / 12)
    const month = ((idx % 12) + 12) % 12
    out.push({ label: MONTHS[month], year })
  }
  return out
}

/** "Mar – Aug 2026" or "Nov 2025 – Apr 2026", for a chart's accessible name. */
export function formatMonthSpan(months: MonthLabel[]) {
  if (months.length === 0) return ""
  const first = months[0]
  const last = months[months.length - 1]
  if (first.year === last.year) return `${first.label} – ${last.label} ${last.year}`
  return `${first.label} ${first.year} – ${last.label} ${last.year}`
}
