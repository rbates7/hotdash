import {
  CENTRAL,
  addDays,
  daysBetween,
  formatDate,
  isIsoDay,
  todayIn,
  type IsoDay,
} from "@/lib/clock"
import {
  dedupe,
  isBoolean,
  isFiniteNumber,
  isIsoInstant,
  isString,
} from "@/lib/persistence"

/**
 * Sales Opportunities domain: live deals only. Rashad: "Staff seats, a
 * college, a clinic that might close. Trip's page. Each row: who, what
 * they're buying, next step, owner." Hunts (the FCS/D2/D3/NAIA email lists)
 * are not deals; a hunt becomes a deal when someone is actually talking.
 *
 * Every figure here is invented. The seed is dated relative to the instant
 * the page was requested, so "Yesterday" and "overdue" are measured from
 * today — in Central calendar days, never the machine zone.
 */

/* ------------------------------------------------------------------ enums */

export const STAGES = ["talking", "proposal", "verbal", "closed-won", "closed-lost"] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_CONFIG: Record<
  Stage,
  { label: string; tone: "muted" | "plan" | "annual" | "good" | "lost"; closed: boolean }
> = {
  talking: { label: "Talking", tone: "muted", closed: false },
  proposal: { label: "Proposal", tone: "plan", closed: false },
  verbal: { label: "Verbal", tone: "annual", closed: false },
  "closed-won": { label: "Closed-won", tone: "good", closed: true },
  "closed-lost": { label: "Closed-lost", tone: "lost", closed: true },
}

export function isStage(value: unknown): value is Stage {
  return isString(value) && (STAGES as readonly string[]).includes(value)
}

/** The people who own deals. Trip runs the page; Rashad and Skye close too. */
export const OWNERS = ["Trip", "Rashad", "Skye"] as const
export type Owner = (typeof OWNERS)[number]

export function isOwner(value: unknown): value is Owner {
  return isString(value) && (OWNERS as readonly string[]).includes(value)
}

/** Open / Won / Lost / All. Open hides both closed stages. */
export const DEAL_FILTERS = ["open", "won", "lost", "all"] as const
export type DealFilter = (typeof DEAL_FILTERS)[number]

export const DEAL_FILTER_LABELS: Record<DealFilter, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  all: "All",
}

export function isDealFilter(value: unknown): value is DealFilter {
  return isString(value) && (DEAL_FILTERS as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------- caps */

/**
 * Field caps. The dialogs put `maxLength` on every input; the store trims
 * and re-checks on load so a hand-edited saved copy cannot exceed them.
 */
export const CAPS = {
  who: 60,
  org: 80,
  what: 80,
  nextStep: 140,
  /** Whole US dollars; seven digits is more than any deal on this page. */
  value: 9_999_999,
  /** Digits the Value input accepts. */
  valueDigits: 7,
} as const

/* ------------------------------------------------------------------- types */

export type Deal = {
  /** "deal-n". */
  id: string
  /** The person. */
  who: string
  /** Their school or organisation. */
  org: string
  /** What they're buying: "Staff seats × 8", "Program license", "Clinic package". */
  what: string
  /** Whole US dollars; null when the number is not known yet. */
  value: number | null
  stage: Stage
  nextStep: string
  /** Central calendar day the next step is due; null when there is no date. */
  nextStepDue: IsoDay | null
  owner: Owner
  /**
   * ISO instant of the last conversation; shown via the shared
   * `formatRelative(..., { style: LAST_TOUCH_STYLE })`.
   */
  lastTouch: string
  createdAt: string
  updatedAt: string
  /** Seed rows are marked Sample data in the table; rows you add are not. */
  sample: boolean
}

/** What the Add / Edit dialogs collect. */
export type DealInput = {
  who: string
  org: string
  what: string
  value: number | null
  stage: Stage
  nextStep: string
  nextStepDue: IsoDay | null
  owner: Owner
}

export const DEAL_KEYS = [
  "id",
  "who",
  "org",
  "what",
  "value",
  "stage",
  "nextStep",
  "nextStepDue",
  "owner",
  "lastTouch",
  "createdAt",
  "updatedAt",
  "sample",
] as const satisfies readonly (keyof Deal)[]

/* ------------------------------------------------------------------- seed */

/** The ids the seed uses; `SEED_DEAL_IDS` lets tests tell seed rows apart. */
export const SEED_DEAL_IDS = new Set([
  "deal-1",
  "deal-2",
  "deal-3",
  "deal-4",
  "deal-5",
  "deal-6",
  "deal-7",
  "deal-8",
])

type SeedRow = Omit<Deal, "id" | "nextStepDue" | "lastTouch" | "createdAt" | "updatedAt" | "sample"> & {
  /** Days from today the next step is due; null for no date. Negative = overdue. */
  dueIn: number | null
  /** Days ago the last conversation happened. */
  touchedDaysAgo: number
}

// Invented names and schools. Football-coaching flavoured on purpose: a D2
// staff, an FCS staff, high-school programs, a clinic host that might buy.
const SEED_ROWS: readonly SeedRow[] = [
  {
    who: "Coach Darnell Whitaker",
    org: "Pine Bluff State (D2)",
    what: "Staff seats × 8",
    value: 3_840,
    stage: "proposal",
    nextStep: "Send the staff-seat quote to the AD",
    dueIn: 2,
    owner: "Trip",
    touchedDaysAgo: 1,
  },
  {
    who: "Coach Marcus Treadwell",
    org: "Red River A&M (FCS)",
    what: "Program license",
    value: 12_000,
    stage: "talking",
    nextStep: "Zoom walk-through with the OC",
    dueIn: 5,
    owner: "Rashad",
    touchedDaysAgo: 3,
  },
  {
    who: "Coach Lonnie Pruitt",
    org: "Cedar Creek HS (6A)",
    what: "Staff seats × 5",
    value: 1_500,
    stage: "verbal",
    nextStep: "Collect the PO from the booster club",
    dueIn: -2,
    owner: "Skye",
    touchedDaysAgo: 6,
  },
  {
    who: "Dana Alvarez",
    org: "Gulf Coast Coaches Clinic (host)",
    what: "Clinic package",
    value: 2_500,
    stage: "talking",
    nextStep: "Confirm the clinic date before pricing",
    dueIn: 9,
    owner: "Trip",
    touchedDaysAgo: 2,
  },
  {
    who: "Coach Reggie Okafor",
    org: "Blue Mesa Prep",
    what: "Annual plan × 3",
    value: 897,
    stage: "proposal",
    nextStep: "Follow up on the trial seats",
    dueIn: -1,
    owner: "Skye",
    touchedDaysAgo: 4,
  },
  {
    who: "Coach Tommy Hale",
    org: "Harlan County HS",
    what: "Staff seats × 4",
    value: null,
    stage: "talking",
    nextStep: "Hear back after their spring staff meeting",
    dueIn: null,
    owner: "Trip",
    touchedDaysAgo: 8,
  },
  {
    who: "Coach Vince Castellano",
    org: "Lakeshore Catholic",
    what: "Program license",
    value: 4_200,
    stage: "closed-won",
    nextStep: "Kickoff call with their staff",
    dueIn: 1,
    owner: "Rashad",
    touchedDaysAgo: 0,
  },
  {
    who: "Coach Aaron Fitch",
    org: "Ironwood College (D3)",
    what: "Staff seats × 6",
    value: 2_100,
    stage: "closed-lost",
    nextStep: "Revisit after their spring game",
    dueIn: null,
    owner: "Trip",
    touchedDaysAgo: 12,
  },
]

/**
 * The sample deals, dated against `nowMs`. Due dates are Central calendar
 * days offset from today. Last touches land at midday Central on the
 * calendar day N days back (not `now − N×24h`, which drifts a day across a
 * DST change), so a seed built at 23:30 CT still says "3 days ago" on both
 * sides of UTC midnight.
 */
export function seedDeals(nowMs: number): Deal[] {
  const instant = new Date(nowMs)
  const today = todayIn(instant)
  const at = instant.toISOString()
  return SEED_ROWS.map((row, i) => {
    const { dueIn, touchedDaysAgo, ...rest } = row
    // 17:00Z is 11am CST / noon CDT: inside the Central day either way.
    const touched =
      touchedDaysAgo === 0 ? at : `${addDays(today, -touchedDaysAgo)}T17:00:00.000Z`
    return {
      id: `deal-${i + 1}`,
      ...rest,
      nextStepDue: dueIn === null ? null : addDays(today, dueIn),
      lastTouch: touched,
      createdAt: touched,
      updatedAt: at,
      sample: true,
    }
  })
}

/* -------------------------------------------------------------- selectors */

export function matchesDealFilter(deal: Deal, filter: DealFilter) {
  switch (filter) {
    case "open":
      return !STAGE_CONFIG[deal.stage].closed
    case "won":
      return deal.stage === "closed-won"
    case "lost":
      return deal.stage === "closed-lost"
    case "all":
      return true
  }
}

export function countByFilter(deals: readonly Deal[]): Record<DealFilter, number> {
  const out: Record<DealFilter, number> = { open: 0, won: 0, lost: 0, all: 0 }
  for (const d of deals) for (const f of DEAL_FILTERS) if (matchesDealFilter(d, f)) out[f]++
  return out
}

export type DealSortKey = "who" | "value" | "stage" | "nextStepDue" | "owner" | "lastTouch"
export type DealSort = { key: DealSortKey; dir: "asc" | "desc" }

/** The default order: soonest next step first, undated rows last. */
export const DEFAULT_DEAL_SORT: DealSort = { key: "nextStepDue", dir: "asc" }

/**
 * Sort deals by one column. Due dates sort chronologically with undated
 * rows always last, whatever the direction; stages follow pipeline order;
 * values put "not known" last; text compares case-insensitively. Ties fall
 * back to id so the order is stable across renders.
 *
 * Local rather than `sortRows` from `@/lib/sort` because nulls-last in both
 * directions and pipeline-ordered stages are rules the generic helper has no
 * way to express.
 */
export function sortDeals(deals: readonly Deal[], sort: DealSort = DEFAULT_DEAL_SORT): Deal[] {
  const sign = sort.dir === "asc" ? 1 : -1
  const byId = (a: Deal, b: Deal) => idNumber(a.id) - idNumber(b.id)
  return [...deals].sort((a, b) => {
    let cmp = 0
    switch (sort.key) {
      case "nextStepDue": {
        if (a.nextStepDue === null || b.nextStepDue === null) {
          // Nulls last regardless of direction.
          cmp = a.nextStepDue === null ? (b.nextStepDue === null ? 0 : 1) : -1
          return cmp || byId(a, b)
        }
        cmp = a.nextStepDue.localeCompare(b.nextStepDue)
        break
      }
      case "value": {
        if (a.value === null || b.value === null) {
          cmp = a.value === null ? (b.value === null ? 0 : 1) : -1
          return cmp || byId(a, b)
        }
        cmp = a.value - b.value
        break
      }
      case "stage":
        cmp = STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
        break
      case "lastTouch":
        cmp = Date.parse(a.lastTouch) - Date.parse(b.lastTouch)
        break
      case "who":
      case "owner":
        cmp = a[sort.key].localeCompare(b[sort.key], "en", { sensitivity: "base" })
        break
    }
    return cmp * sign || byId(a, b)
  })
}

export function idNumber(id: string) {
  const m = /^deal-(\d+)$/.exec(id)
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

/** The highest deal-n suffix; 0 when there are none. */
export function highestDealId(deals: readonly Deal[]) {
  return deals.reduce((max, d) => {
    const m = /^deal-(\d+)$/.exec(d.id)
    const n = m ? Number(m[1]) : 0
    return n > max ? n : max
  }, 0)
}

/* ---------------------------------------------------------------- dates */

/**
 * Where a next step stands against today (a Central calendar day):
 * negative = overdue by that many days, 0 = due today, positive = days
 * left, null = no date.
 */
export function daysToDue(deal: Pick<Deal, "nextStepDue">, today: IsoDay): number | null {
  return deal.nextStepDue === null ? null : daysBetween(today, deal.nextStepDue)
}

export function isOverdue(deal: Pick<Deal, "nextStepDue" | "stage">, today: IsoDay) {
  if (STAGE_CONFIG[deal.stage].closed) return false
  const d = daysToDue(deal, today)
  return d !== null && d < 0
}

/**
 * Last-touch labels on this screen. `long` is the calendar-day style the
 * Sales copy uses: "just now" · "5 min ago" · "3 h ago" · "Yesterday" ·
 * "Mon, Oct 5". The shared default (`ago`) would print "1d ago" / "3d ago"
 * and lose the Central-day "Yesterday" the seed is dated against.
 */
export const LAST_TOUCH_STYLE = "long" as const

/**
 * Where a next step stands, in Sales copy: "Due today", "Due tomorrow",
 * "Due in 3 days", "Overdue 2 days". The shared `formatRelativeDay` speaks
 * a different language ("Today" / "in 3 days" / "2 days ago") and has no
 * overdue wording, so this stays local.
 */
export function describeDue(deal: Pick<Deal, "nextStepDue">, today: IsoDay) {
  const d = daysToDue(deal, today)
  if (d === null || deal.nextStepDue === null) return null
  const date = formatDate(deal.nextStepDue)
  if (d === 0) return { date, relative: "Due today", overdue: false }
  if (d < 0) {
    const n = -d
    return { date, relative: `Overdue ${n} day${n === 1 ? "" : "s"}`, overdue: true }
  }
  return { date, relative: d === 1 ? "Due tomorrow" : `Due in ${d} days`, overdue: false }
}

let centralDateTime: Intl.DateTimeFormat | undefined

/**
 * "7 Oct 2026, 9:14 AM CT" for an instant — the long form behind the
 * relative last-touch label. Built on first use (Intl formatters are costly to construct and a
 * server render may never need one), always in Central.
 */
export function formatCentralDateTime(instant: string | Date) {
  centralDateTime ??= new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  const date = typeof instant === "string" ? new Date(instant) : instant
  if (!Number.isFinite(date.getTime())) return String(instant)
  // en-US prints "Oct 7, 2026, 9:14 AM"; the dashboard writes day-first.
  const parts = centralDateTime.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")} CT`
}

/* -------------------------------------------------------------- guards */

function withinCap(value: unknown, cap: number): value is string {
  return isString(value) && value.trim().length > 0 && value.length <= cap
}

function isValue(value: unknown): value is number | null {
  return (
    value === null ||
    (isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value <= CAPS.value)
  )
}

/**
 * Every field is checked, not just the envelope: an unknown stage or owner,
 * a date like 2026-13-45, a timestamp that does not round-trip, a value
 * over the cap or a string past its `maxLength` all fail. Unknown keys are
 * tolerated here and stripped by `stripDeal` on load.
 */
export function isDeal(value: unknown): value is Deal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    /^deal-\d+$/.test(v.id) &&
    withinCap(v.who, CAPS.who) &&
    withinCap(v.org, CAPS.org) &&
    withinCap(v.what, CAPS.what) &&
    isValue(v.value) &&
    isStage(v.stage) &&
    withinCap(v.nextStep, CAPS.nextStep) &&
    (v.nextStepDue === null || isIsoDay(v.nextStepDue)) &&
    isOwner(v.owner) &&
    isIsoInstant(v.lastTouch) &&
    isIsoInstant(v.createdAt) &&
    isIsoInstant(v.updatedAt) &&
    isBoolean(v.sample)
  )
}

/** A copy of the deal with only the known keys, so a saved extra never survives. */
export function stripDeal(deal: Deal): Deal {
  const out = {} as Record<string, unknown>
  for (const key of DEAL_KEYS) out[key] = deal[key]
  return out as Deal
}

/** Ids are unique, and no id collides with the counter that mints the next one. */
export function dealsAreConsistent(deals: readonly Deal[], nextId: number) {
  if (dedupe(deals.map((d) => d.id)).length !== deals.length) return false
  if (!Number.isInteger(nextId) || nextId <= highestDealId(deals)) return false
  return true
}

/* ------------------------------------------------------------ formatting */

/** Trim a dialog field and cap it, the same way the store does before saving. */
export function clampText(value: string, cap: number) {
  return value.trim().slice(0, cap)
}
