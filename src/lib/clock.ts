/**
 * The one clock for the dashboard.
 *
 * `now()` is real time. Pages read it once per request and hand the instant
 * down to the store (`IssuesProvider nowMs`), so the server render and the
 * client hydration measure every relative figure — "18m", "9 days left",
 * the weekday in the Home lede — from the same instant, and the dummy
 * fixtures are generated against it (see `buildIssues`, `buildSprints`,
 * `buildInbox`). Nothing is frozen: a sprint seeded "9 days out" is nine
 * days out from today, whatever today is.
 *
 * Tests pin time with `vi.useFakeTimers()` / `vi.setSystemTime()` or pass a
 * fixed `Date` straight to the builders.
 */
export function now(): Date {
  return new Date()
}

/** Where the founder is. Display-side weekday and clock labels use it. */
export const CENTRAL = "America/Chicago"

/* ------------------------------------------------------------ calendar */

/**
 * Calendar-day helpers, all Central. Every one that can take an instant
 * resolves it in `CENTRAL` first, never via the machine zone: a UTC server
 * and a Central browser otherwise disagree about the date between roughly
 * 7pm and midnight Central, and hydration mismatches.
 */

/** YYYY-MM-DD, a calendar date with no time or zone attached. */
export type IsoDay = string

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: CENTRAL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** The calendar day an instant falls on in `timeZone` (Central by default). */
export function todayIn(instant: Date, timeZone: string = CENTRAL): IsoDay {
  const fmt =
    timeZone === CENTRAL
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

/** An instant becomes its Central calendar day; a day passes through. */
export function toDay(value: IsoDay | Date): IsoDay {
  return value instanceof Date ? todayIn(value) : value
}

/**
 * True only for a real calendar day in canonical form: the string must
 * survive a round trip through Date, so "2026-13-45" and "2026-2-3" fail.
 */
export function isIsoDay(value: unknown): value is IsoDay {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const t = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value
}

/** Shift a calendar day by whole days. Done in UTC so DST cannot skew it. */
export function addDays(day: IsoDay | Date, days: number): IsoDay {
  const d = new Date(`${toDay(day)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDay | Date, to: IsoDay | Date): number {
  const a = new Date(`${toDay(from)}T00:00:00Z`).getTime()
  const b = new Date(`${toDay(to)}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export type Period = { start: IsoDay; end: IsoDay }

/** How long the reporting window is, in days. */
export const PERIOD_DAYS = 28

/** The reporting window: the trailing four weeks ending `today`, inclusive. */
export function periodEnding(today: IsoDay | Date): Period {
  const end = toDay(today)
  return { start: addDays(end, -(PERIOD_DAYS - 1)), end }
}

/** The window of the same length immediately before `period`. */
export function periodBefore(period: Period): Period {
  return { start: addDays(period.start, -PERIOD_DAYS), end: addDays(period.start, -1) }
}

/** Whether a calendar day falls inside a period, inclusive at both ends. */
export function inPeriod(day: IsoDay, period: Period) {
  return day >= period.start && day <= period.end
}

// Hand-rolled rather than Intl: newer ICU data prints "Sept" for en-GB and
// the mock (and the rest of the dashboard) use three-letter months.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function parts(day: IsoDay): [y: number, m: number, d: number] | null {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return null
  return [y, m, d]
}

/** "2026-08-18" → "18 Aug 2026". An instant is read in `CENTRAL` first. */
export function formatDate(day: IsoDay | Date) {
  const iso = toDay(day)
  const p = parts(iso)
  if (!p) return iso
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
export function monthsEnding(today: IsoDay | Date, count: number): MonthLabel[] {
  const p = parts(toDay(today))
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
