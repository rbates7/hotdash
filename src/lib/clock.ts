/**
 * The one clock for the dashboard while it runs on dummy data.
 *
 * Every relative figure — "18m ago", "9 days left", the weekday in the Home
 * lede — is measured from this instant, and the fixtures are generated
 * against it, so the sprint can never read "9 days left" on a page that
 * thinks it is a month later. It is frozen rather than `Date.now()` so the
 * server and the client render the same HTML.
 *
 * When real data lands, `now()` becomes `new Date()` and nothing else moves.
 */
export const DEMO_NOW = new Date("2026-08-27T14:00:00.000Z")

export function now(): Date {
  return DEMO_NOW
}
