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

/**
 * `count` back-to-back windows of `days` days, oldest first, the last one
 * ending `today`. The sparklines are six of these — 28-day windows, not
 * calendar months — so they are labelled by the day each window ends.
 */
export function windowsEnding(today: IsoDay | Date, count: number, days = PERIOD_DAYS): Period[] {
  const end = toDay(today)
  const out: Period[] = []
  for (let i = count - 1; i >= 0; i--) {
    const windowEnd = addDays(end, -i * days)
    out.push({ start: addDays(windowEnd, -(days - 1)), end: windowEnd })
  }
  return out
}

/** "15 May – 7 Oct 2026": the first window's start to the last one's end. */
export function formatWindowSpan(windows: readonly Period[]) {
  if (windows.length === 0) return ""
  return formatPeriod({ start: windows[0].start, end: windows[windows.length - 1].end })
}

/** "7 Oct" — a window's end, without the year, for a point label. */
export function formatDayShort(day: IsoDay | Date) {
  const p = parts(toDay(day))
  if (!p) return toDay(day)
  return `${p[2]} ${MONTHS[p[1] - 1]}`
}

/** The `count` calendar days ending `today`, oldest first. */
export function daysEnding(today: IsoDay | Date, count: number): IsoDay[] {
  const end = toDay(today)
  return Array.from({ length: count }, (_, i) => addDays(end, -(count - 1 - i)))
}

/* --------------------------------------------------------- relative time */

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL,
  weekday: "short",
  month: "short",
  day: "numeric",
})

export type RelativeStyle = "ago" | "compact" | "long"

/**
 * The one relative-time formatter for the dashboard. Three styles, all
 * measured from `nowMs` (the page's instant, never a wall clock):
 *
 * - `ago` (default) — ticket activity and comments, as the mock writes them:
 *   "just now" · "5m ago" · "2h ago" · "1d ago". Arithmetic.
 * - `compact` — Inbox rows and Home's Needs-you, as the mock writes them:
 *   "now" · "18m" · "2h" · "Yesterday" (24–47 h) · "2d". Arithmetic.
 * - `long` — opt-in, for System Status: "just now" · "5 min ago" ·
 *   "3 h ago" · "Yesterday" · "Mon, Oct 5", with calendar days in Central
 *   so a row from 11pm last night reads "Yesterday" at 1pm, not "14 h ago".
 */
export function formatRelative(
  fromMs: number,
  nowMs: number,
  { style = "ago" }: { style?: RelativeStyle } = {}
) {
  const mins = Math.round((nowMs - fromMs) / 60_000)
  switch (style) {
    case "ago": {
      if (mins < 1) return "just now"
      if (mins < 60) return `${mins}m ago`
      const hours = Math.round(mins / 60)
      if (hours < 24) return `${hours}h ago`
      return `${Math.round(hours / 24)}d ago`
    }
    case "compact": {
      if (mins < 1) return "now"
      if (mins < 60) return `${mins}m`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h`
      const days = Math.floor(hours / 24)
      return days === 1 ? "Yesterday" : `${days}d`
    }
    case "long": {
      if (mins < 1) return "just now"
      if (mins < 60) return `${mins} min ago`
      const days = daysBetween(todayIn(new Date(fromMs)), todayIn(new Date(nowMs)))
      if (days <= 0) return `${Math.floor(mins / 60)} h ago`
      if (days === 1) return "Yesterday"
      return WEEKDAY_DATE.format(new Date(fromMs))
    }
  }
}

/**
 * A calendar day relative to `today`, both read as Central days: "Today",
 * "Tomorrow", "Yesterday", "in 15 days", "81 days ago". Built on
 * `daysBetween`, so it is whole calendar days — a sprint ending at 00:30
 * tomorrow is "Tomorrow" at 23:30 tonight, not "in 1 hour". For Clinics'
 * schedule and anything else that talks about days rather than instants.
 */
export function formatRelativeDay(day: IsoDay | Date, today: IsoDay | Date) {
  const delta = daysBetween(toDay(today), toDay(day))
  if (delta === 0) return "Today"
  if (delta === 1) return "Tomorrow"
  if (delta === -1) return "Yesterday"
  return delta > 0 ? `in ${delta} days` : `${-delta} days ago`
}
