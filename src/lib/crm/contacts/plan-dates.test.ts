import { describe, expect, it } from "vitest"

import { planDateLabel } from "./plan-dates"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 8, 2)

describe("planDateLabel", () => {
  it("shows when paying started for someone still paying", () => {
    expect(
      planDateLabel(
        { planStatus: "active", planStartedAt: new Date(now - 3 * DAY), planEndedAt: null },
        now
      )
    ).toEqual({ label: "Started", date: new Date(now - 3 * DAY), ended: false })
  })

  it("reads 'Starts' for a trial that has not converted yet", () => {
    expect(
      planDateLabel(
        { planStatus: "trialing", planStartedAt: new Date(now + 5 * DAY), planEndedAt: null },
        now
      )?.label
    ).toBe("Starts")
  })

  it("shows the end date, muted, for someone who left", () => {
    expect(
      planDateLabel(
        {
          planStatus: "canceled",
          planStartedAt: new Date(now - 400 * DAY),
          planEndedAt: new Date(now - 2 * DAY),
        },
        now
      )
    ).toEqual({ label: "Ended", date: new Date(now - 2 * DAY), ended: true })
  })

  it("keeps showing the start for a scheduled cancellation that is still paying", () => {
    // Stripe leaves ended_at empty until the period actually ends.
    expect(
      planDateLabel(
        { planStatus: "active", planStartedAt: new Date(now - 30 * DAY), planEndedAt: null },
        now
      )?.label
    ).toBe("Started")
  })

  it("has nothing to say without dates", () => {
    expect(
      planDateLabel({ planStatus: "canceled", planStartedAt: null, planEndedAt: null }, now)
    ).toBeNull()
  })
})
