import { describe, expect, it } from "vitest"

import {
  canOverwriteName,
  customerType,
  normalizeEmail,
  splitDisplayName,
} from "./matching"

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Dana@Acme.COM ")).toBe("dana@acme.com")
  })
})

describe("splitDisplayName", () => {
  it("splits first and last", () => {
    expect(splitDisplayName("Dana Whitfield")).toEqual({
      firstName: "Dana",
      lastName: "Whitfield",
    })
  })

  it("keeps middle names in the last name", () => {
    expect(splitDisplayName("Ana Maria Silva")).toEqual({
      firstName: "Ana",
      lastName: "Maria Silva",
    })
  })

  it("handles single names, quotes, and empties", () => {
    expect(splitDisplayName("Dana")).toEqual({
      firstName: "Dana",
      lastName: null,
    })
    expect(splitDisplayName('"Dana Whitfield"')).toEqual({
      firstName: "Dana",
      lastName: "Whitfield",
    })
    expect(splitDisplayName("  ")).toEqual({ firstName: null, lastName: null })
    expect(splitDisplayName(undefined)).toEqual({
      firstName: null,
      lastName: null,
    })
  })
})

describe("canOverwriteName precedence (manual > supabase > stripe > gmail)", () => {
  it("anything fills an empty slot", () => {
    expect(canOverwriteName(null, "gmail")).toBe(true)
    expect(canOverwriteName(null, "manual")).toBe(true)
  })

  it("equal or higher rank overwrites", () => {
    expect(canOverwriteName("gmail", "stripe")).toBe(true)
    expect(canOverwriteName("stripe", "supabase")).toBe(true)
    expect(canOverwriteName("supabase", "supabase")).toBe(true)
    expect(canOverwriteName("supabase", "manual")).toBe(true)
  })

  it("lower rank never overwrites", () => {
    expect(canOverwriteName("manual", "supabase")).toBe(false)
    expect(canOverwriteName("supabase", "stripe")).toBe(false)
    expect(canOverwriteName("stripe", "gmail")).toBe(false)
  })
})

describe("customerType", () => {
  it("treats a customer with no organization as an individual (B2C)", () => {
    expect(customerType({ organizationId: null })).toBe("individual")
  })

  it("treats a customer attached to an organization as team (B2B)", () => {
    expect(customerType({ organizationId: "org_acme" })).toBe("team")
  })
})
