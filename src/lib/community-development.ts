import { addDays, daysBetween, formatDate, formatRelativeDay, isIsoDay, type IsoDay } from "@/lib/clock"
import { isString } from "@/lib/persistence"

/**
 * Community Development domain: giving and foundation work only.
 * Rashad, 7 Oct 2026: serving and giving-back opportunities and Chlk's
 * foundation efforts. Not coach communities (Play Callers, groups) and
 * not content (One Play a Day).
 *
 * Everything here is sample data until a datastore lands; the shapes are
 * real so the store can validate a saved copy field by field.
 */

export const INITIATIVE_TYPES = ["volunteer", "donation", "foundation", "outreach"] as const
export type InitiativeType = (typeof INITIATIVE_TYPES)[number]

export const INITIATIVE_TYPE_LABEL: Record<InitiativeType, string> = {
  volunteer: "Volunteer",
  donation: "Donation",
  foundation: "Foundation program",
  outreach: "Outreach event",
}

export const INITIATIVE_STATUSES = ["idea", "planned", "active", "done"] as const
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number]

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  active: "Active",
  done: "Done",
}

export type Initiative = {
  /** `initiative-n`; seeds are 1–7, user rows continue from the store's counter. */
  id: string
  name: string
  type: InitiativeType
  /** School, league, nonprofit — who we are giving to or serving with. */
  partner: string
  /**
   * Central calendar day when we have one (YYYY-MM-DD). Cadence-only rows
   * (an annual scholarship, a talk without a date yet) keep this null.
   */
  date: IsoDay | null
  /** Recurring or "once we have a date" wording. Empty when the row is a one-off. */
  cadence: string
  status: InitiativeStatus
  owner: string
  /** What we gave / the impact, free text — never a dollar total. */
  impact: string
}

/** Field caps. The form sets `maxLength`, the store clamps, the guard re-checks on load. */
export const INITIATIVE_LIMITS = {
  name: 80,
  partner: 80,
  cadence: 60,
  owner: 40,
  impact: 200,
} as const

export const DEFAULT_OWNER = "Rashad"

/* ---------------------------------------------------------------- guards */

export function isInitiativeType(value: unknown): value is InitiativeType {
  return isString(value) && (INITIATIVE_TYPES as readonly string[]).includes(value)
}

export function isInitiativeStatus(value: unknown): value is InitiativeStatus {
  return isString(value) && (INITIATIVE_STATUSES as readonly string[]).includes(value)
}

const isText = (v: unknown, max: number): v is string => isString(v) && v.length <= max

export const INITIATIVE_ID = /^initiative-(\d+)$/

/**
 * Every field, not just the envelope: an unknown type or status, a date
 * like 2026-13-45, a name that is only spaces, or a note past its cap all
 * fail, and the store drops the copy for the seed rather than rendering
 * half a row. A row must have a date, a cadence, or both.
 */
export function isInitiative(value: unknown): value is Initiative {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (
    !(
      isString(v.id) &&
      INITIATIVE_ID.test(v.id) &&
      isText(v.name, INITIATIVE_LIMITS.name) &&
      v.name.trim().length > 0 &&
      isInitiativeType(v.type) &&
      isText(v.partner, INITIATIVE_LIMITS.partner) &&
      isInitiativeStatus(v.status) &&
      isText(v.owner, INITIATIVE_LIMITS.owner) &&
      isText(v.impact, INITIATIVE_LIMITS.impact) &&
      isText(v.cadence, INITIATIVE_LIMITS.cadence)
    )
  ) {
    return false
  }
  if (v.date !== null && !isIsoDay(v.date)) return false
  if (v.date === null && v.cadence.trim().length === 0) return false
  return true
}

/** Only the known keys, so a stray field in a saved copy never travels further. */
export function stripInitiative(row: Initiative): Initiative {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    partner: row.partner,
    date: row.date,
    cadence: row.cadence,
    status: row.status,
    owner: row.owner,
    impact: row.impact,
  }
}

/** The numeric suffix of an `initiative-n` id; 0 for anything else. */
export function initiativeNumber(id: string) {
  const m = INITIATIVE_ID.exec(id)
  return m ? Number(m[1]) : 0
}

/* ------------------------------------------------------------ normalising */

const clampText = (s: string, max: number) => s.trim().slice(0, max)

/** What the form hands the store: everything but the id. */
export type InitiativeInput = Omit<Initiative, "id">

/**
 * Trim and clamp every field so the store only ever holds rows the guard
 * above would accept, whatever the form let through. A blank date becomes
 * null; a blank owner becomes Rashad.
 */
export function normalizeInput(input: InitiativeInput): InitiativeInput {
  const date = input.date && isIsoDay(input.date) ? input.date : null
  const cadence = clampText(input.cadence, INITIATIVE_LIMITS.cadence)
  return {
    name: clampText(input.name, INITIATIVE_LIMITS.name),
    type: input.type,
    partner: clampText(input.partner, INITIATIVE_LIMITS.partner),
    date,
    cadence,
    status: input.status,
    owner: clampText(input.owner, INITIATIVE_LIMITS.owner) || DEFAULT_OWNER,
    impact: clampText(input.impact, INITIATIVE_LIMITS.impact),
  }
}

/** Field-by-field equality, so a Save that changed nothing is a no-op. */
export function sameInitiative(a: Initiative, b: Initiative) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.type === b.type &&
    a.partner === b.partner &&
    a.date === b.date &&
    a.cadence === b.cadence &&
    a.status === b.status &&
    a.owner === b.owner &&
    a.impact === b.impact
  )
}

/* --------------------------------------------------------------- calendar */

/** Calendar year of a Central day (`YYYY`). */
export function yearOf(day: IsoDay) {
  return day.slice(0, 4)
}

/**
 * A day `want` days before `today`, clamped so it never crosses into last
 * year. On 1 Jan the offset collapses to today itself.
 */
export function daysAgoThisYear(today: IsoDay, want: number): IsoDay {
  const yearStart = `${yearOf(today)}-01-01`
  const max = daysBetween(yearStart, today)
  return addDays(today, -Math.min(want, Math.max(0, max)))
}

/**
 * Upcoming in the next `days` days on the founder's calendar: has a date,
 * is not Done, and the date sits from today through today+days inclusive.
 * Cadence-only rows do not count — there is no day to be "upcoming".
 */
export function isUpcomingIn(
  row: Pick<Initiative, "date" | "status">,
  today: IsoDay,
  days = 30
) {
  if (!row.date || row.status === "done") return false
  return row.date >= today && row.date <= addDays(today, days)
}

export function isDoneThisYear(row: Pick<Initiative, "date" | "status">, today: IsoDay) {
  return row.status === "done" && row.date !== null && yearOf(row.date) === yearOf(today)
}

export type Summary = {
  active: number
  upcoming: number
  doneThisYear: number
}

/** Active count, upcoming in the next 30 days, done this year. No dollars. */
export function summarize(rows: readonly Initiative[], today: IsoDay): Summary {
  return {
    active: rows.filter((r) => r.status === "active").length,
    upcoming: rows.filter((r) => isUpcomingIn(r, today, 30)).length,
    doneThisYear: rows.filter((r) => isDoneThisYear(r, today)).length,
  }
}

export const TYPE_FILTERS = ["all", ...INITIATIVE_TYPES] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]

export const TYPE_FILTER_LABEL: Record<TypeFilter, string> = {
  all: "All types",
  ...INITIATIVE_TYPE_LABEL,
}

export const STATUS_FILTERS = ["all", ...INITIATIVE_STATUSES] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All statuses",
  ...INITIATIVE_STATUS_LABEL,
}

export function isTypeFilter(value: unknown): value is TypeFilter {
  return isString(value) && (TYPE_FILTERS as readonly string[]).includes(value)
}

export function isStatusFilter(value: unknown): value is StatusFilter {
  return isString(value) && (STATUS_FILTERS as readonly string[]).includes(value)
}

export function matchesFilters(
  row: Pick<Initiative, "type" | "status">,
  type: TypeFilter,
  status: StatusFilter
) {
  return (type === "all" || row.type === type) && (status === "all" || row.status === status)
}

const STATUS_RANK: Record<InitiativeStatus, number> = {
  active: 0,
  planned: 1,
  idea: 2,
  done: 3,
}

/** Active / Planned first, then Idea, then Done; dated soonest first; id as tie-break. */
export function sortInitiatives(rows: readonly Initiative[]): Initiative[] {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.date && !b.date) return -1
    if (!a.date && b.date) return 1
    return initiativeNumber(a.id) - initiativeNumber(b.id)
  })
}

export function filterInitiatives(
  rows: readonly Initiative[],
  type: TypeFilter,
  status: StatusFilter
) {
  return sortInitiatives(rows.filter((r) => matchesFilters(r, type, status)))
}

/** How the When column reads: a date, a cadence, or both. */
export function formatWhen(row: Pick<Initiative, "date" | "cadence">, today: IsoDay) {
  if (row.date) {
    return {
      primary: formatDate(row.date),
      secondary: row.cadence || undefined,
      relative: formatRelativeDay(row.date, today),
    }
  }
  return { primary: row.cadence, secondary: undefined, relative: undefined }
}

/** A row's accessible summary, e.g. for a delete confirm. */
export function describeInitiative(row: Initiative) {
  const when = row.date ? formatDate(row.date) : row.cadence
  return when ? `${row.name} · ${when}` : row.name
}

/* ------------------------------------------------------------ preview */

/** Review-only query: `/community-development?preview=skeleton`. */
export const PREVIEW_PARAM = "preview"
export const PREVIEWS = ["skeleton", "error"] as const
export type Preview = (typeof PREVIEWS)[number]

export function isPreview(value: unknown): value is Preview {
  return isString(value) && (PREVIEWS as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------- seed */

/**
 * Eight rows around `today`: two Active, three upcoming in the next 30
 * days, one Done this year, two Ideas (one cadence-only foundation
 * scholarship, one outreach talk). Offsets stay relative so the same
 * split holds on any day.
 */
export function seedInitiatives(today: IsoDay): Initiative[] {
  const dated = (offset: number) => addDays(today, offset)
  const row = (
    n: number,
    name: string,
    type: InitiativeType,
    partner: string,
    date: IsoDay | null,
    cadence: string,
    status: InitiativeStatus,
    owner: string,
    impact: string
  ): Initiative => ({
    id: `initiative-${n}`,
    name,
    type,
    partner,
    date,
    cadence,
    status,
    owner,
    impact,
  })
  return [
    row(
      1,
      "Youth flag-football clinic volunteer day",
      "volunteer",
      "Houston Youth Flag League",
      dated(12),
      "",
      "planned",
      "Trip",
      "40 kids coached"
    ),
    row(
      2,
      "Refurbished iPads for a Title I program",
      "donation",
      "Katy ISD Title I",
      daysAgoThisYear(today, 40),
      "",
      "done",
      "Rashad",
      "12 iPads"
    ),
    row(
      3,
      "Chlk Foundation coaching scholarship",
      "foundation",
      "Chlk Foundation",
      null,
      "Annual, each spring",
      "idea",
      "Rashad",
      ""
    ),
    row(
      4,
      "Equipment drive for Yates High School",
      "donation",
      "Yates High School football",
      dated(8),
      "",
      "active",
      "Skye",
      "helmets, pads, and a playbook print run"
    ),
    row(
      5,
      "Coaches serve-day at the Houston Food Bank",
      "volunteer",
      "Houston Food Bank",
      dated(21),
      "",
      "planned",
      "Trip",
      ""
    ),
    row(
      6,
      "Free play-calling clinic for middle-school coaches",
      "outreach",
      "Cy-Fair ISD athletics",
      dated(45),
      "",
      "planned",
      "Skye",
      ""
    ),
    row(
      7,
      "Booster-club talk on giving back",
      "outreach",
      "Westlake HS booster club",
      null,
      "Once we have a date",
      "idea",
      "Rashad",
      ""
    ),
    row(
      8,
      "Saturday volunteer coaching at Alief rec",
      "volunteer",
      "Alief rec league",
      daysAgoThisYear(today, 14),
      "Weekly, Saturday mornings",
      "active",
      "Trip",
      "18 kids on Saturdays"
    ),
  ]
}

/** Ids the seed uses; anything else was entered by the user. */
export const SEED_INITIATIVE_IDS: ReadonlySet<string> = new Set(
  seedInitiatives("2026-10-07").map((r) => r.id)
)

export function isSeedInitiative(row: Pick<Initiative, "id">) {
  return SEED_INITIATIVE_IDS.has(row.id)
}
