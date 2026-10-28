import { describe, expect, it } from "vitest"

import {
  accountsTotals,
  filterOrgs,
  formatMrr,
  orgInitials,
  parseAccountDetail,
  parseAccounts,
  searchOrgs,
  searchUsers,
  sortOrgs,
  tabCount,
  visibleAccounts,
  type AccountOrg,
  type AccountUser,
} from "@/lib/crm/accounts/model"

// Test-only rows: hand-built shapes, never shipped anywhere.
const NOW = Date.parse("2026-10-27T12:00:00.000Z")

let n = 0
function user(o: Partial<AccountUser> = {}): AccountUser {
  n += 1
  return { id: `u${n}`, name: `User ${n}`, email: `user${n}@test.invalid`, organization: null, plan: null, planStatus: null, ...o }
}

function org(o: Partial<AccountOrg> = {}): AccountOrg {
  n += 1
  return {
    id: `o${n}`,
    name: `Org ${n}`,
    domain: null,
    stripeCustomerId: null,
    status: "active",
    canceled: false,
    plan: "Monthly",
    mrrCents: 0,
    openCases: 0,
    users: [],
    ...o,
  }
}

describe("tabs (filters) and totals", () => {
  const live = org({ users: [user(), user()] })
  const canceled = org({ canceled: true, status: "canceled", users: [user()] })
  const noSub = org({ status: "none", plan: null })
  const all = [live, canceled, noSub]

  it("All is every org; Canceled only canceled ones; No organization has no orgs", () => {
    expect(filterOrgs(all, "all")).toHaveLength(3)
    expect(filterOrgs(all, "canceled")).toEqual([canceled])
    expect(filterOrgs(all, "no_org")).toEqual([])
  })

  it("counts organizations, users attached and users with no org", () => {
    const t = accountsTotals({ orgs: all, noOrgUsers: [user(), user()] })
    expect(t).toEqual({ organizations: 3, usersAttached: 3, usersNoOrg: 2, canceledOrgs: 1 })
    expect(tabCount(t, "all")).toBe(3)
    expect(tabCount(t, "canceled")).toBe(1)
    expect(tabCount(t, "no_org")).toBe(2)
  })

  it("an empty body is all zeros", () => {
    expect(accountsTotals({ orgs: [], noOrgUsers: [] })).toEqual({ organizations: 0, usersAttached: 0, usersNoOrg: 0, canceledOrgs: 0 })
  })
})

describe("sort", () => {
  it("is always A to Z by name, case-insensitively", () => {
    const a = org({ name: "alpha" })
    const b = org({ name: "Bravo" })
    const c = org({ name: "charlie" })
    expect(sortOrgs([c, b, a]).map((o) => o.name)).toEqual(["alpha", "Bravo", "charlie"])
  })

  it("ties on name break on id, so the order never jumps", () => {
    const x = org({ id: "o-b", name: "Same" })
    const y = org({ id: "o-a", name: "same" })
    expect(sortOrgs([x, y]).map((o) => o.id)).toEqual(["o-a", "o-b"])
  })

  it("never mutates its input", () => {
    const later = org({ name: "Zulu" })
    const sooner = org({ name: "Alpha" })
    const input = [later, sooner]
    sortOrgs(input)
    expect(input).toEqual([later, sooner])
  })
})

describe("search", () => {
  const ada = user({ name: "Ada Lovelace", email: "ada@engine.test" })
  const withUser = org({ name: "Analytical", domain: "engine.test", users: [ada] })
  const other = org({ name: "Babbage Hall", domain: "hall.test" })
  const loose = user({ name: "Grace Hopper", email: "grace@navy.test" })

  it("matches orgs on name, domain or any user's name or email, case-insensitively", () => {
    expect(searchOrgs([withUser, other], "babbage")).toEqual([other])
    expect(searchOrgs([withUser, other], "HALL.TEST")).toEqual([other])
    expect(searchOrgs([withUser, other], "lovelace")).toEqual([withUser])
    expect(searchOrgs([withUser, other], "ada@engine")).toEqual([withUser])
    expect(searchOrgs([withUser, other], "  ")).toEqual([withUser, other])
    expect(searchOrgs([withUser, other], "zephyr")).toEqual([])
  })

  it("matches users on name or email", () => {
    expect(searchUsers([ada, loose], "navy")).toEqual([loose])
    expect(searchUsers([ada, loose], "ada")).toEqual([ada])
  })

  it("visible rows: All carries the no-org users, A to Z; Canceled does not; No organization is only them", () => {
    const data = { orgs: [other, withUser], noOrgUsers: [loose] }
    expect(visibleAccounts(data, { tab: "all", q: "" })).toEqual({ orgs: [withUser, other], noOrgUsers: [loose] })
    expect(visibleAccounts(data, { tab: "canceled", q: "" })).toEqual({ orgs: [], noOrgUsers: [] })
    expect(visibleAccounts(data, { tab: "no_org", q: "" })).toEqual({ orgs: [], noOrgUsers: [loose] })
    expect(visibleAccounts(data, { tab: "all", q: "zephyr" })).toEqual({ orgs: [], noOrgUsers: [] })
  })
})

describe("parse", () => {
  const body = { status: "connected", missing: [], lastSyncedAt: new Date(NOW).toISOString(), lastTriedAt: null, stripeContacts: 3, orgs: [org()], noOrgUsers: [user()] }

  it("accepts the route's body", () => {
    expect(parseAccounts(body)).toMatchObject({ status: "connected", stripeContacts: 3 })
  })

  it("refuses anything else (the screen then says Not connected)", () => {
    expect(parseAccounts(null)).toBeNull()
    expect(parseAccounts({ ...body, status: "live" })).toBeNull()
    expect(parseAccounts({ ...body, orgs: [{ id: 1 }] })).toBeNull()
    expect(parseAccounts({ ...body, noOrgUsers: "x" })).toBeNull()
  })

  it("keeps only known missing sources", () => {
    expect(parseAccounts({ ...body, status: "not_connected", missing: ["stripe", "nope"] })?.missing).toEqual(["stripe"])
  })

  it("parses a detail body, org or null", () => {
    expect(parseAccountDetail({ status: "connecting", org: null })).toMatchObject({ status: "connecting", org: null })
    expect(parseAccountDetail({ status: "connected", org: org({ name: "X" }) })?.org?.name).toBe("X")
    expect(parseAccountDetail({ status: "connected", org: { id: "x" } })).toBeNull()
  })
})

describe("formatting", () => {
  it("MRR in whole dollars, a dash for none", () => {
    expect(formatMrr(10_500)).toBe("$105")
    expect(formatMrr(123_456_78)).toBe("$123,457")
    expect(formatMrr(0)).toBe("—")
  })

  it("initials from the first two words", () => {
    expect(orgInitials("Westside High")).toBe("WH")
    expect(orgInitials("acme")).toBe("A")
    expect(orgInitials("")).toBe("?")
  })
})
