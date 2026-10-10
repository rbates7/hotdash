/**
 * A fixed instant for tests: Thursday 27 Aug 2026, 09:00 in Chicago. Pass it
 * to the fixture builders and `IssuesProvider`, or pin the process clock to
 * it with `vi.useFakeTimers({ now: FIXED_NOW })`.
 */
export const FIXED_NOW = new Date("2026-08-27T14:00:00.000Z")
export const FIXED_NOW_MS = FIXED_NOW.getTime()

/**
 * 23:30 Central on 7 Oct 2026 (CDT, UTC−5): already 8 Oct in UTC. The
 * instant every clock test uses to prove Central and UTC disagree — a date
 * helper that reads the machine zone would say the 8th.
 */
export const LATE_EVENING_CT = new Date("2026-10-08T04:30:00.000Z")
export const LATE_EVENING_CT_MS = LATE_EVENING_CT.getTime()
