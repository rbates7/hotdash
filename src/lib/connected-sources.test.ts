import { describe, expect, it } from "vitest"

import { CONNECTED_SOURCES, stateFromHealth } from "./connected-sources"

describe("connected sources", () => {
  it("lists the six sources in order", () => {
    expect(CONNECTED_SOURCES.map((s) => s.name)).toEqual(["Stripe", "App Store", "PostHog", "Notion", "Gmail", "Sentry"])
  })
  it("only Stripe has a live health route", () => {
    expect(CONNECTED_SOURCES.filter((s) => s.healthRoute).map((s) => s.name)).toEqual(["Stripe"])
  })
  it("maps health answers to states", () => {
    expect(stateFromHealth("ok", true)).toBe("connected")
    expect(stateFromHealth("not_configured", true)).toBe("not_connected")
    expect(stateFromHealth("unavailable", true)).toBe("needs_setup")
    expect(stateFromHealth("ok", false)).toBe("needs_setup")
    expect(stateFromHealth(undefined, false)).toBe("needs_setup")
  })
})
