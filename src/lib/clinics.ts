import { addDays, formatDate, isIsoDay, type IsoDay } from "@/lib/clock"
import { isFiniteNumber, isString } from "@/lib/persistence"

/**
 * Clinics page domain: one row per clinic — when, who hosts, whether we
 * show up, what we collected. Trip's page (reqs: "Dates, hosts, whether we
 * show up, what we collected. One row per clinic."). Everything here is
 * sample data until a datastore lands; the shapes are real so the store can
 * validate a saved copy field by field.
 */

export const CLINIC_TYPES = ["clinic", "zoom", "staff-meeting"] as const
export type ClinicType = (typeof CLINIC_TYPES)[number]

export const CLINIC_TYPE_LABEL: Record<ClinicType, string> = {
  clinic: "Clinic",
  zoom: "Zoom",
  "staff-meeting": "Staff meeting",
}

/**
 * Whether we show up. `planned` is the default for anything on the
 * calendar; once the day has passed the founder marks it attended or
 * skipped, and until then a past row reads "Unconfirmed".
 */
export const ATTENDANCES = ["planned", "attended", "skipped"] as const
export type Attendance = (typeof ATTENDANCES)[number]

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  planned: "Planned",
  attended: "Attended",
  skipped: "Skipped",
}

/** What a clinic yields, counted on the day. */
export type Collected = {
  leads: number
  emails: number
  demos: number
}

export const COLLECTED_KEYS = ["leads", "emails", "demos"] as const
export type CollectedKey = (typeof COLLECTED_KEYS)[number]

export type Clinic = {
  /** `clinic-n`; seeds are 1–8, user rows continue from the store's counter. */
  id: string
  name: string
  /** Central calendar day (YYYY-MM-DD). Clinics are day-granular on this page. */
  date: IsoDay
  host: string
  /** City, or "Remote" for a Zoom. */
  city: string
  type: ClinicType
  attendance: Attendance
  collected: Collected
  owner: string
  notes: string
}

/** Field caps. The form sets `maxLength`, the store clamps, the guard re-checks on load. */
export const CLINIC_LIMITS = {
  name: 80,
  host: 80,
  city: 60,
  owner: 40,
  notes: 500,
  /** Per collected count; a clinic that yields more than this is not a clinic. */
  collected: 9_999,
} as const

export const DEFAULT_OWNER = "Trip"

export const EMPTY_COLLECTED: Collected = { leads: 0, emails: 0, demos: 0 }

/* ---------------------------------------------------------------- guards */

export function isClinicType(value: unknown): value is ClinicType {
  return isString(value) && (CLINIC_TYPES as readonly string[]).includes(value)
}

export function isAttendance(value: unknown): value is Attendance {
  return isString(value) && (ATTENDANCES as readonly string[]).includes(value)
}

const isCount = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v <= CLINIC_LIMITS.collected

const isText = (v: unknown, max: number): v is string => isString(v) && v.length <= max

export function isCollected(value: unknown): value is Collected {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return isCount(v.leads) && isCount(v.emails) && isCount(v.demos)
}

export const CLINIC_ID = /^clinic-(\d+)$/

/**
 * Every field, not just the envelope: an unknown type or attendance, a date
 * like 2026-13-45, a negative count or a note past its cap all fail, and
 * the store drops the copy for the seed rather than rendering half a row.
 */
export function isClinic(value: unknown): value is Clinic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return (
    isString(v.id) &&
    CLINIC_ID.test(v.id) &&
    isText(v.name, CLINIC_LIMITS.name) &&
    v.name.trim().length > 0 &&
    isIsoDay(v.date) &&
    isText(v.host, CLINIC_LIMITS.host) &&
    isText(v.city, CLINIC_LIMITS.city) &&
    isClinicType(v.type) &&
    isAttendance(v.attendance) &&
    isCollected(v.collected) &&
    isText(v.owner, CLINIC_LIMITS.owner) &&
    isText(v.notes, CLINIC_LIMITS.notes)
  )
}

/** Only the known keys, so a stray field in a saved copy never travels further. */
export function stripClinic(c: Clinic): Clinic {
  return {
    id: c.id,
    name: c.name,
    date: c.date,
    host: c.host,
    city: c.city,
    type: c.type,
    attendance: c.attendance,
    collected: { leads: c.collected.leads, emails: c.collected.emails, demos: c.collected.demos },
    owner: c.owner,
    notes: c.notes,
  }
}

/** The numeric suffix of a `clinic-n` id; 0 for anything else. */
export function clinicNumber(id: string) {
  const m = CLINIC_ID.exec(id)
  return m ? Number(m[1]) : 0
}

/* ------------------------------------------------------------ normalising */

const clampText = (s: string, max: number) => s.trim().slice(0, max)
const clampCount = (n: number) =>
  Number.isFinite(n) ? Math.min(CLINIC_LIMITS.collected, Math.max(0, Math.round(n))) : 0

/** What the form hands the store: everything but the id. */
export type ClinicInput = Omit<Clinic, "id">

/**
 * Trim, clamp and round every field so the store only ever holds rows the
 * guard above would accept, whatever the form let through.
 */
export function normalizeInput(input: ClinicInput): ClinicInput {
  return {
    name: clampText(input.name, CLINIC_LIMITS.name),
    date: input.date,
    host: clampText(input.host, CLINIC_LIMITS.host),
    city: clampText(input.city, CLINIC_LIMITS.city),
    type: input.type,
    attendance: input.attendance,
    collected: {
      leads: clampCount(input.collected.leads),
      emails: clampCount(input.collected.emails),
      demos: clampCount(input.collected.demos),
    },
    owner: clampText(input.owner, CLINIC_LIMITS.owner) || DEFAULT_OWNER,
    notes: clampText(input.notes, CLINIC_LIMITS.notes),
  }
}

/** Field-by-field equality, so a Save that changed nothing is a no-op. */
export function sameClinic(a: Clinic, b: Clinic) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.date === b.date &&
    a.host === b.host &&
    a.city === b.city &&
    a.type === b.type &&
    a.attendance === b.attendance &&
    a.collected.leads === b.collected.leads &&
    a.collected.emails === b.collected.emails &&
    a.collected.demos === b.collected.demos &&
    a.owner === b.owner &&
    a.notes === b.notes
  )
}

/* --------------------------------------------------------------- calendar */

/**
 * Upcoming is today or later on the founder's calendar (America/Chicago);
 * Past is strictly before today. `today` is the page's one clock reading,
 * so a clinic at 23:30 Central tonight is still "Today" even though UTC
 * has moved on.
 */
export function isUpcoming(clinic: Pick<Clinic, "date">, today: IsoDay) {
  return clinic.date >= today
}

export type Split = { upcoming: Clinic[]; past: Clinic[] }

/** Upcoming soonest first, Past most recent first — the mock's order. */
export function splitClinics(clinics: readonly Clinic[], today: IsoDay): Split {
  const upcoming = clinics.filter((c) => isUpcoming(c, today)).sort(byDate(1))
  const past = clinics.filter((c) => !isUpcoming(c, today)).sort(byDate(-1))
  return { upcoming, past }
}

function byDate(sign: 1 | -1) {
  return (a: Clinic, b: Clinic) => {
    if (a.date !== b.date) return a.date < b.date ? -sign : sign
    // Same day: keep a stable, meaningful order by id (older rows first).
    return clinicNumber(a.id) - clinicNumber(b.id)
  }
}

export type Status = "upcoming" | "done" | "skipped" | "unconfirmed"

export const STATUS_LABEL: Record<Status, string> = {
  upcoming: "Upcoming",
  done: "Done",
  skipped: "Skipped",
  unconfirmed: "Unconfirmed",
}

/**
 * The status pill. Anything still ahead is Upcoming whatever we plan to do
 * about it; once the day has passed the row says what actually happened,
 * or that nobody has said yet.
 */
export function statusOf(clinic: Pick<Clinic, "date" | "attendance">, today: IsoDay): Status {
  if (isUpcoming(clinic, today)) return "upcoming"
  if (clinic.attendance === "attended") return "done"
  if (clinic.attendance === "skipped") return "skipped"
  return "unconfirmed"
}

/** "12 leads · 9 emails · 2 demos", or null when nothing was collected. */
export function formatCollected(c: Collected): string | null {
  const parts: string[] = []
  if (c.leads) parts.push(`${c.leads} ${c.leads === 1 ? "lead" : "leads"}`)
  if (c.emails) parts.push(`${c.emails} ${c.emails === 1 ? "email" : "emails"}`)
  if (c.demos) parts.push(`${c.demos} ${c.demos === 1 ? "demo" : "demos"}`)
  return parts.length ? parts.join(" · ") : null
}

/** A row's accessible summary, e.g. for a delete confirm. */
export function describeClinic(c: Clinic) {
  return `${c.name} · ${formatDate(c.date)}`
}

/* ------------------------------------------------------------------- seed */

/**
 * The day the Clinics mock was drawn. Seed rows are day offsets so that
 * `seedClinics(MOCK_DAY)` reproduces the mock's dates exactly, while on any
 * other day the same four sit ahead of "today" and the same four behind it.
 */
export const CLINICS_MOCK_DAY: IsoDay = "2026-08-28"

/** Eight rows: four upcoming, four past, as the mock shows. */
export function seedClinics(today: IsoDay): Clinic[] {
  const d = (offset: number) => addDays(today, offset)
  const row = (
    n: number,
    name: string,
    offset: number,
    host: string,
    city: string,
    type: ClinicType,
    attendance: Attendance,
    collected: Collected,
    notes: string
  ): Clinic => ({
    id: `clinic-${n}`,
    name,
    date: d(offset),
    host,
    city,
    type,
    attendance,
    collected,
    owner: DEFAULT_OWNER,
    notes,
  })
  return [
    row(1, "Houston Offensive Staff Clinic", 15, "Cy-Fair ISD coaches association", "Houston", "clinic", "planned", EMPTY_COLLECTED, "Trip presents the install flow; bring the iPad demo rig."),
    row(2, "Dallas 7-on-7 Coaches Night", 22, "North Texas 7v7 league", "Dallas", "clinic", "planned", EMPTY_COLLECTED, "Evening slot after pool play. Skye joins for CRM follow-ups."),
    row(3, "Midweek CHLK walkthrough", 27, "CHLK (open invite)", "Remote", "zoom", "planned", EMPTY_COLLECTED, "Standing Zoom; link goes out to the trial list."),
    row(4, "Austin staff install", 36, "Westlake HS football", "Austin", "staff-meeting", "planned", EMPTY_COLLECTED, "Whole-staff onboarding on their devices."),
    row(5, "Spring Houston walk-through", -81, "Katy ISD athletics", "Houston", "clinic", "attended", { leads: 14, emails: 11, demos: 3 }, "Two staffs asked about annual pricing."),
    row(6, "Dallas staff huddle", -98, "Highland Park HS", "Dallas", "staff-meeting", "attended", { leads: 6, emails: 6, demos: 1 }, "Converted to a staff plan the following week."),
    row(7, "Remote playbook office hours", -106, "CHLK (open invite)", "Remote", "zoom", "attended", { leads: 9, emails: 9, demos: 0 }, "Mostly existing trials; good questions on sharing."),
    row(8, "Fort Worth spring clinic", -121, "Tarrant County coaches clinic", "Fort Worth", "clinic", "attended", { leads: 21, emails: 17, demos: 4 }, "Biggest room so far. Two college staffs in the back."),
  ]
}

/** Ids the seed uses; anything else was entered by the user. */
export const SEED_CLINIC_IDS: ReadonlySet<string> = new Set(
  seedClinics(CLINICS_MOCK_DAY).map((c) => c.id)
)

export function isSeedClinic(c: Pick<Clinic, "id">) {
  return SEED_CLINIC_IDS.has(c.id)
}
