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
