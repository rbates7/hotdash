/**
 * A fixed instant for tests: Thursday 27 Aug 2026, 09:00 in Chicago. Pass it
 * to the fixture builders and `IssuesProvider`, or pin the process clock to
 * it with `vi.useFakeTimers({ now: FIXED_NOW })`.
 */
export const FIXED_NOW = new Date("2026-08-27T14:00:00.000Z")
export const FIXED_NOW_MS = FIXED_NOW.getTime()
