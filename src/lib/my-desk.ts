import { daysBetween, formatDayShort, isIsoDay, todayIn, type IsoDay } from "@/lib/clock"
import { isBoolean, isString } from "@/lib/persistence"

/**
 * My Desk domain: Rashad's personal to-dos for today and one plain-text
 * scratch note. Sample data until a datastore lands; the shapes are real so
 * the store can validate a saved copy field by field.
 *
 * Unfinished to-dos from an earlier Central day stay on today's list with a
 * "from Tue" label. Items completed on an earlier day stay in storage but
 * drop off the list. There is no link to Agent Workplace issues — this is
 * a personal scratch space, not the agent board.
 */

export type Todo = {
  /** `todo-n`; seeds are 1–7, user rows continue from the store's counter. */
  id: string
  title: string
  /** One-line sub-note; empty string when the founder left it blank. */
  note: string
  done: boolean
  /** Central day the row was added. Kept when an unfinished row carries over. */
  createdOn: IsoDay
  /** Central day the row was marked done; `null` while it is open. */
  doneOn: IsoDay | null
}

/** What the form hands the store: title, note, done. The store stamps the days. */
export type TodoInput = Omit<Todo, "id" | "createdOn" | "doneOn">

/** Field caps. The form sets `maxLength`, the store clamps, the guard re-checks on load. */
export const TODO_LIMITS = {
  title: 80,
  note: 160,
  scratch: 8_000,
} as const

export const TODO_ID = /^todo-(\d+)$/

const isText = (v: unknown, max: number): v is string => isString(v) && v.length <= max

/**
 * Every field, not just the envelope: a blank title, a note past its cap
 * or a non-boolean `done` all fail, and the store drops the copy for the
 * seed rather than rendering half a row.
 */
export function isTodo(value: unknown): value is Todo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    TODO_ID.test(v.id) &&
    isText(v.title, TODO_LIMITS.title) &&
    v.title.trim().length > 0 &&
    isText(v.note, TODO_LIMITS.note) &&
    isBoolean(v.done) &&
    isIsoDay(v.createdOn) &&
    (v.doneOn === null || isIsoDay(v.doneOn)) &&
    (v.done ? v.doneOn !== null : v.doneOn === null)
  )
}

/** Only the known keys, so a stray field in a saved copy never travels further. */
export function stripTodo(t: Todo): Todo {
  return {
    id: t.id,
    title: t.title,
    note: t.note,
    done: t.done,
    createdOn: t.createdOn,
    doneOn: t.doneOn,
  }
}

/** The numeric suffix of a `todo-n` id; 0 for anything else. */
export function todoNumber(id: string) {
  const m = TODO_ID.exec(id)
  return m ? Number(m[1]) : 0
}

const clampText = (s: string, max: number) => s.trim().slice(0, max)

/** Trim and clamp so the store only ever holds rows the guard would accept. */
export function normalizeTodoInput(input: TodoInput): TodoInput {
  return {
    title: clampText(input.title, TODO_LIMITS.title),
    note: clampText(input.note, TODO_LIMITS.note),
    done: input.done,
  }
}

export function normalizeScratch(text: string) {
  return text.slice(0, TODO_LIMITS.scratch)
}

/** Field-by-field equality, so a Save that changed nothing is a no-op. */
export function sameTodo(a: Todo, b: Todo) {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.note === b.note &&
    a.done === b.done &&
    a.createdOn === b.createdOn &&
    a.doneOn === b.doneOn
  )
}

/**
 * Today's list: open rows (including those added on an earlier Central day)
 * and rows completed today. Completed rows from an earlier day stay in
 * storage and are filtered out here — this is a view, not a copy, so a
 * reload or a second tab cannot duplicate a row.
 */
export function todaysTodos(todos: readonly Todo[], today: IsoDay): Todo[] {
  return todos.filter((t) => !t.done || t.doneOn === today)
}

/** Weekday of a Central calendar day, e.g. "Tue". Same table as the date chip. */
function weekdayOf(day: IsoDay): string {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return day
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]
}

/** Full weekday, e.g. "Tuesday", for the row's accessible description. */
function weekdayLongOf(day: IsoDay): string {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return day
  return WEEKDAYS_LONG[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]
}

/**
 * Quiet label for a carried-over row; `null` when the row was added today.
 * 1–6 days ago stays a weekday ("from Tue"); 7 or more is a date
 * ("from 30 Sep") so the same weekday a week later cannot be read as today.
 */
export function carryFromLabel(createdOn: IsoDay, today: IsoDay): string | null {
  const days = daysBetween(createdOn, today)
  if (days <= 0) return null
  if (days <= 6) return `from ${weekdayOf(createdOn)}`
  return `from ${formatDayShort(createdOn)}`
}

/**
 * Spoken form of the carry-over label for the checkbox description:
 * "added Tuesday" within a week, "added 30 Sep" after that.
 */
export function carryFromSpoken(createdOn: IsoDay, today: IsoDay): string | null {
  const days = daysBetween(createdOn, today)
  if (days <= 0) return null
  if (days <= 6) return `added ${weekdayLongOf(createdOn)}`
  return `added ${formatDayShort(createdOn)}`
}

/**
 * Milliseconds from `instant` until the next Central midnight. Found by
 * searching with `todayIn` so DST cannot skew a constructed UTC hour.
 */
export function msUntilNextCentralMidnight(instant: Date): number {
  const today = todayIn(instant)
  let lo = instant.getTime()
  let hi = lo + 36 * 60 * 60 * 1000
  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2)
    if (todayIn(new Date(mid)) === today) lo = mid
    else hi = mid
  }
  return Math.max(hi - instant.getTime(), 0)
}

/** A row's accessible summary, e.g. for a delete confirm. */
export function describeTodo(t: Pick<Todo, "title" | "note">) {
  return t.note ? `${t.title} — ${t.note}` : t.title
}

export function openCount(todos: readonly Pick<Todo, "done">[]) {
  return todos.filter((t) => !t.done).length
}

/* ----------------------------------------------------------------- dates */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

/**
 * The mock's date chip: "Wed 26 Aug". Built from a Central calendar day
 * (YYYY-MM-DD), never the machine zone — the weekday is of that date, so
 * a UTC server and a Central browser agree.
 */
export function formatDeskDate(day: IsoDay): string {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return day
  return `${weekdayOf(day)} ${d} ${MONTHS[m - 1]}`
}

/* ------------------------------------------------------------------ seed */

/**
 * The day Deke's founder mock was drawn. Fresh seed rows are dated from
 * the request's Central day (Reset too); the chip next to Today follows
 * the same clock via `formatDeskDate`.
 */
export const DESK_MOCK_DAY: IsoDay = "2026-08-26"

/** The mock's one scratch note. Plain text, not an editor. */
export const SEED_SCRATCH = [
  "Aledo wants the 11-personnel packet before Friday.",
  "",
  "Keep this off Workplace. Personal only.",
  "",
  "Dan\u2019s hash-left idea \u2192 Feature Request.",
  "",
  "Houston clinic: iPad + one-pager.",
  "",
  "Simmons \u2014 Fort Worth roster still out.",
  "",
  "Home Sunday if the Austin install holds.",
].join("\n")

export function isSeedScratch(text: string) {
  return text === SEED_SCRATCH
}

/** Seven rows as the mock shows them — five open, two done. Dated `day`. */
export function seedTodos(day: IsoDay = DESK_MOCK_DAY): Todo[] {
  const row = (n: number, title: string, note: string, done: boolean): Todo => ({
    id: `todo-${n}`,
    title,
    note,
    done,
    createdOn: day,
    doneOn: done ? day : null,
  })
  return [
    row(1, "Call Aledo", "HC \u2014 Friday walk-through", false),
    row(2, "Clinic follow-up", "Houston staff \u2014 one-pager", false),
    row(3, "Look at Metrics", "Overnight signups", false),
    row(4, "Reply to Dan", "Hash-left idea \u2014 Feature Request, not here", false),
    row(5, "Text May \u2014 Dallas night", "Coaches night seating", true),
    row(6, "Confirm Austin flight", "Sunday return if install holds", true),
    row(7, "Sketch Aledo install notes", "11-personnel packet", false),
  ]
}

/** Ids the seed uses; anything else was entered by the user. */
export const SEED_TODO_IDS: ReadonlySet<string> = new Set(seedTodos().map((t) => t.id))

export function isSeedTodo(t: Pick<Todo, "id">) {
  return SEED_TODO_IDS.has(t.id)
}
