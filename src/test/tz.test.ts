import { describe, expect, it } from "vitest"

import { LATE_EVENING_CT } from "@/test/clock"

/**
 * The suite runs twice in CI — `pnpm test` under TZ=UTC and `pnpm test:tz`
 * under TZ=America/Chicago — so every date test is exercised in a zone where
 * the Central day differs from the machine day. This pins that the process
 * really is in the zone the script asked for; if it is not, the other runs
 * are proving less than they claim.
 */
describe("process time zone", () => {
  it("is the one the test script set", () => {
    const expected = process.env.TZ
    expect(expected, "TZ is set by the test scripts (or defaulted to UTC by vitest.config.ts)").toMatch(
      /^(UTC|America\/Chicago)$/
    )
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(expected)
    // Sanity: the two zones really do disagree about a late-evening Central instant.
    const localDay = LATE_EVENING_CT.getDate()
    expect(localDay).toBe(expected === "UTC" ? 8 : 7)
  })
})
