import { describe, expect, it } from "vitest"

import { PLAN_LABELS, planLabelFor } from "./plan-map"

const sub = (over: Partial<Parameters<typeof planLabelFor>[0]> = {}) => ({
  priceId: null,
  productId: null,
  nickname: null,
  ...over,
})

describe("planLabelFor", () => {
  it("names Chlk's real plans", () => {
    expect(planLabelFor(sub({ priceId: "price_1PJ7iaDtAjmN4bYiaQMVMRNJ" }))).toBe(
      "Monthly Webapp"
    )
    expect(planLabelFor(sub({ priceId: "price_1PJ7ktDtAjmN4bYiXmSkOJgt" }))).toBe(
      "Yearly Webapp"
    )
    expect(planLabelFor(sub({ priceId: "price_1TgsbODtAjmN4bYiiIK7sTPQ" }))).toBe(
      "2-4 seat Staff"
    )
    expect(planLabelFor(sub({ priceId: "price_1TgsbODtAjmN4bYi8nOhcRvQ" }))).toBe(
      "5-9 seat Staff"
    )
    expect(planLabelFor(sub({ priceId: "price_1TgsbODtAjmN4bYimyyoCQuC" }))).toBe(
      "10+ seat Staff"
    )
  })

  it("maps every id to a distinct label", () => {
    // The three Staff ids differ only near the end; a copy-paste slip would
    // silently label two seat tiers the same.
    const labels = Object.values(PLAN_LABELS)
    expect(new Set(labels).size).toBe(labels.length)
    expect(new Set(Object.keys(PLAN_LABELS)).size).toBe(
      Object.keys(PLAN_LABELS).length
    )
  })

  it("keys look like Stripe price or product ids", () => {
    for (const key of Object.keys(PLAN_LABELS)) {
      expect(key).toMatch(/^(price|prod)_[A-Za-z0-9]+$/)
    }
  })

  it("falls back to the nickname, then the id, for anything unmapped", () => {
    expect(
      planLabelFor(sub({ priceId: "price_unknown", nickname: "iPad App Monthly" }))
    ).toBe("iPad App Monthly")
    expect(planLabelFor(sub({ priceId: "price_unknown" }))).toBe("price_unknown")
    expect(planLabelFor(sub())).toBeNull()
  })
})
