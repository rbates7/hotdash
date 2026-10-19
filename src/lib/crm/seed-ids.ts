/**
 * The ids the old CRM sample used, written out as literals so the browser
 * bundle carries only these strings and none of the sample's names or
 * messages (`@/lib/crm/fixture` is for tests). The store needs them for
 * two things: dropping the sample from a copy saved before it was removed
 * (`dropSeed`), and starting new rows past every id and case number it
 * used. `seed-ids.test.ts` checks each set against the fixture.
 */
const range = (prefix: string, count: number): ReadonlySet<string> =>
  new Set(Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`))

export const SEED_ORGANIZATION_IDS = range("org", 3)
export const SEED_CONTACT_IDS = range("contact", 6)
export const SEED_CASE_IDS = range("case", 8)
export const SEED_MESSAGE_IDS = range("message", 18)
export const SEED_NOTE_IDS = range("note", 5)
export const SEED_THREAD_IDS = range("thread", 10)

/** The sample's highest case number (#1–#8). */
export const SEED_LAST_CASE_NUMBER = 8

/** Where a fresh CRM's counters start: one past the sample's highest of each. */
export const FIRST_AFTER_SEED = {
  org: SEED_ORGANIZATION_IDS.size + 1,
  contact: SEED_CONTACT_IDS.size + 1,
  case: SEED_CASE_IDS.size + 1,
  message: SEED_MESSAGE_IDS.size + 1,
  note: SEED_NOTE_IDS.size + 1,
  caseNumber: SEED_LAST_CASE_NUMBER + 1,
} as const
