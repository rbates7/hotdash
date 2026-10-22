import { describe, expect, it } from "vitest"

import { planLabelFor } from "./plan-map"

describe("planLabelFor", () => {
  it.each([
    ["price_1TgsbODtAjmN4bYimyyoCQuC", "prod_UgF5PgksiSygJq", "Staff"],
    ["price_1PJ7ktDtAjmN4bYiXmSkOJgt", "prod_Q9QcuvwIwiqZ3C", "Annual"],
    ["price_1PJ7iaDtAjmN4bYiaQMVMRNJ", "prod_Q9QZm6YVzbNEAl", "Monthly"],
    ["price_1OaCf2DtAjmN4bYi0l4WRUVp", "prod_PP0gjGGanXjyVl", "Monthly"],
  ])("maps live Chlk catalog %s", (priceId, productId, expected) => {
    expect(planLabelFor({ priceId, productId, nickname: "fallback" })).toBe(
      expected
    )
  })

  it("falls back to Stripe's nickname for an unmapped price", () => {
    expect(
      planLabelFor({
        priceId: "price_future",
        productId: "prod_future",
        nickname: "Future plan",
      })
    ).toBe("Future plan")
  })
})
