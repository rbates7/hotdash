import { addDays, type IsoDay } from "@/lib/clock"
import {
  DEFAULT_OWNER,
  EMPTY_COLLECTED,
  type Attendance,
  type Clinic,
  type ClinicType,
  type Collected,
} from "@/lib/clinics"

/**
 * The old Clinics sample, for tests only: the app ships no sample clinics
 * (Rashad's Oct 16 rule), and the store drops these ids from an old saved
 * copy (`SEED_CLINIC_IDS`). Tests that need rows use `founderClinics`, the
 * same rows under ids of the founder's own.
 */

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


/** The sample's rows under the founder's own ids (clinic-1 → clinic-101): survive `dropSeed`. */
export function founderClinics(today: IsoDay): Clinic[] {
  return seedClinics(today).map((c) => ({ ...c, id: c.id.replace(/^clinic-(\d+)$/, (_, n) => `clinic-${100 + Number(n)}`) }))
}

/** A saved Clinics copy holding `founderClinics(today)`. */
export function founderClinicsState(today: IsoDay) {
  const clinics = founderClinics(today)
  return { clinics, nextId: 109 }
}
