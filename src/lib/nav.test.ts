import { describe, expect, it } from "vitest"

import { isActiveRoute, navLabelFor } from "@/lib/nav"

describe("navLabelFor", () => {
  it("returns the sidebar label for a top-level route", () => {
    expect(navLabelFor("/home")).toBe("Home")
    expect(navLabelFor("/sales-opportunities")).toBe("Sales Opportunities")
  })

  it("keeps nested CRM paths on CRM", () => {
    expect(navLabelFor("/crm")).toBe("CRM")
    expect(navLabelFor("/crm/cases/abc")).toBe("CRM")
    expect(navLabelFor("/crm/contacts/1")).toBe("CRM")
  })

  it("falls back when the path is not a sidebar item", () => {
    expect(navLabelFor("/nope")).toBe("Founder dashboard")
  })
})

describe("isActiveRoute", () => {
  it("matches the route and its descendants", () => {
    expect(isActiveRoute("/crm/cases", "/crm")).toBe(true)
    expect(isActiveRoute("/home", "/crm")).toBe(false)
  })
})
