/**
 * The keys and ids the old Agent Workplace demo board used, written out as
 * literals so the browser bundle carries only these strings and none of the
 * demo's titles or descriptions (`@/lib/issues-fixture` is for tests). The
 * store drops them from a copy saved before the seed was removed
 * (`dropSeed` in `issues-store`), and new tickets start past the highest
 * key. `issues-seed-ids.test.ts` checks each set against the fixture.
 */
const keys = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `CHLK-${from + i}`)

/** CHLK-401 … CHLK-421: every ticket the demo board shipped. */
export const SEED_ISSUE_KEYS: ReadonlySet<string> = new Set(keys(401, 421))

/** The demo's two sprints. Founder sprints are `sprint-<n>-<name>`, so never these. */
export const SEED_SPRINT_IDS: ReadonlySet<string> = new Set(["sprint-4", "sprint-5"])

/** The demo's highest ticket number; a fresh board's first key is one past it. */
export const SEED_LAST_ISSUE_NUMBER = 421
