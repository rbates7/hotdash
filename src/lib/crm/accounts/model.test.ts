import { describe, expect, it } from "vitest"

import {
  accountsTotals,
  daysUntil,
  filterOrgs,
  formatMrr,
  orgInitials,
  parseAccountDetail,
  parseAccounts,
  renewalTag,
  renewalTagLabel,
  searchOrgs,
  searchUsers,
  seatChip,
  seatChipLabel,
  seatFillPct,
  sortOrgs,
  stripeSubscriptionUrl,
  tabCount,
  visibleAccounts,
  type AccountOrg,
  type AccountUser,
} from "@/lib/crm/accounts/model"

// Test-only rows: hand-built shapes, never shipped anywhere.
const NOW = Date.parse("2026-10-27T12:00:00.000Z")
const DAY = 86_400_000
const at = (days: number) => new Date(NOW + days * DAY).toISOString()

let n = 0
function user(o: Partial<AccountUser> = {}): AccountUser {
  n += 1
  return { id: `u${n}`, name: `User ${n}`, email: `user${n}@test.invalid`, organization: null, startedAt: null, plan: null, planStatus: null, ...o }
}

function org(o: Partial<AccountOrg> = {}): AccountOrg {
  n += 1
  return {
    id: `o${n}`,
    name: `Org ${n}`,
    domain: null,
    stripeCustomerId: null,
    subscriptionId: null,
    status: "active",
    canceled: false,
    plan: "Monthly",
    interval: "month",
    seatsUsed: 1,
    seatsTotal: 2,
    seatMonthlyCents: null,
    customerSince: null,
    renewsAt: null,
    renewalKind: "renews",
    termMonths: 12,
    mrrCents: 0,
    openCases: 0,
    users: [],
    ...o,
  }
}

describe("seat chip", () => {
  it("is green N open below the limit, amber Full at it, red +N over above it", () => {
    expect(seatChip(2, 5)).toEqual({ kind: "open", n: 3 })
    expect(seatChip(6, 6)).toEqual({ kind: "full" })
    expect(seatChip(4, 3)).toEqual({ kind: "over", n: 1 })
    expect(seatChipLabel(seatChip(2, 5)!)).toBe("3 open")
    expect(seatChipLabel(seatChip(6, 6)!)).toBe("Full")
    expect(seatChipLabel(seatChip(4, 3)!)).toBe("+1 over")
  })

  it("has no chip without a seat count, and an empty org is all open", () => {
    expect(seatChip(3, null)).toBeNull()
    expect(seatChip(0, 4)).toEqual({ kind: "open", n: 4 })
    expect(seatChip(0, 0)).toEqual({ kind: "full" })
  })

  it("fills the bar proportionally, capped at 100", () => {
    expect(seatFillPct(5, 8)).toBe(63)
    expect(seatFillPct(4, 3)).toBe(100)
    expect(seatFillPct(0, 3)).toBe(0)
    expect(seatFillPct(2, null)).toBe(100)
    expect(seatFillPct(0, null)).toBe(0)
  })
})

describe("renewal tag", () => {
  it("counts whole days up", () => {
    expect(daysUntil(at(13), NOW)).toBe(13)
    expect(daysUntil(at(12.2), NOW)).toBe(13)
    expect(daysUntil(at(0.1), NOW)).toBe(1)
  })

  it("is amber in N days within 30 days, nothing further out or with no date", () => {
    expect(renewalTag(org({ renewsAt: at(13) }), NOW)).toEqual({ kind: "soon", days: 13 })
    expect(renewalTag(org({ renewsAt: at(30) }), NOW)).toEqual({ kind: "soon", days: 30 })
    expect(renewalTag(org({ renewsAt: at(31) }), NOW)).toBeNull()
    expect(renewalTag(org({ renewsAt: null }), NOW)).toBeNull()
    expect(renewalTag(org({ renewsAt: at(-3) }), NOW)).toBeNull()
  })

  it("is red Lapsed for a canceled org, whatever the date", () => {
    expect(renewalTag(org({ canceled: true, renewsAt: at(-30) }), NOW)).toEqual({ kind: "lapsed" })
    expect(renewalTag(org({ canceled: true, renewsAt: null }), NOW)).toEqual({ kind: "lapsed" })
  })

  it("labels", () => {
    expect(renewalTagLabel({ kind: "lapsed" })).toBe("Lapsed")
    expect(renewalTagLabel({ kind: "soon", days: 13 })).toBe("in 13 days")
    expect(renewalTagLabel({ kind: "soon", days: 1 })).toBe("in 1 day")
    expect(renewalTagLabel({ kind: "soon", days: 0 })).toBe("today")
  })
})

describe("tabs (filters)", () => {
  const open = org({ seatsUsed: 2, seatsTotal: 5 })
  const full = org({ seatsUsed: 6, seatsTotal: 6 })
  const over = org({ seatsUsed: 4, seatsTotal: 3 })
  const canceled = org({ seatsUsed: 3, seatsTotal: 3, canceled: true, status: "canceled" })
  const noSub = org({ seatsUsed: 2, seatsTotal: null, status: "none" })
  const all = [open, full, over, canceled, noSub]

  it("puts each org in exactly one seat tab; canceled wins over Full", () => {
    expect(filterOrgs(all, "open")).toEqual([open])
    expect(filterOrgs(all, "full")).toEqual([full])
    expect(filterOrgs(all, "over")).toEqual([over])
    expect(filterOrgs(all, "canceled")).toEqual([canceled])
    expect(filterOrgs(all, "all")).toHaveLength(5)
    expect(filterOrgs(all, "no_org")).toEqual([])
  })

  it("totals count only live subscriptions' seats", () => {
    const t = accountsTotals({ orgs: all, noOrgUsers: [user(), user()] })
    expect(t).toMatchObject({
      organizations: 5,
      usersAttached: 2 + 6 + 4 + 3 + 2,
      usersNoOrg: 2,
      activeOrgs: 3,
      totalSeats: 5 + 6 + 3,
      seatsUsed: 2 + 6 + 4,
      openSeats: 3,
      openOrgs: 1,
      fullOrgs: 1,
      overOrgs: 1,
      canceledOrgs: 1,
    })
    expect(tabCount(t, "all")).toBe(5)
    expect(tabCount(t, "no_org")).toBe(2)
    expect(tabCount(t, "over")).toBe(1)
  })
})

describe("sort", () => {
  const soon = org({ name: "Soon", renewsAt: at(13) })
  const later = org({ name: "Later", renewsAt: at(200) })
  const none = org({ name: "Nodate", renewsAt: null })
  const lapsed = org({ name: "Lapsed", canceled: true, renewsAt: at(-20) })

  it("defaults to renewal soonest: live dates first, then no date, canceled last", () => {
    expect(sortOrgs([lapsed, none, later, soon], "renewal").map((o) => o.name)).toEqual(["Soon", "Later", "Nodate", "Lapsed"])
  })

  it("renewal latest reverses the dates but keeps missing and canceled at the bottom", () => {
    expect(sortOrgs([soon, lapsed, none, later], "renewal_desc").map((o) => o.name)).toEqual(["Later", "Soon", "Nodate", "Lapsed"])
  })

  it("sorts by name, users, open seats and MRR; ties break on name", () => {
    const a = org({ name: "alpha", seatsUsed: 2, seatsTotal: 10, mrrCents: 500 })
    const b = org({ name: "Bravo", seatsUsed: 9, seatsTotal: 10, mrrCents: 9000 })
    const c = org({ name: "charlie", seatsUsed: 2, seatsTotal: null, mrrCents: 500 })
    expect(sortOrgs([c, b, a], "name").map((o) => o.name)).toEqual(["alpha", "Bravo", "charlie"])
    expect(sortOrgs([a, c, b], "users").map((o) => o.name)).toEqual(["Bravo", "alpha", "charlie"])
    expect(sortOrgs([c, b, a], "open_seats").map((o) => o.name)).toEqual(["alpha", "Bravo", "charlie"])
    expect(sortOrgs([a, c, b], "mrr").map((o) => o.name)).toEqual(["Bravo", "alpha", "charlie"])
  })

  it("never mutates its input", () => {
    const input = [later, soon]
    sortOrgs(input, "renewal")
    expect(input).toEqual([later, soon])
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

  it("visible rows: All carries the no-org users; seat tabs do not; No organization is only them", () => {
    const data = { orgs: [withUser, other], noOrgUsers: [loose] }
    expect(visibleAccounts(data, { tab: "all", q: "", sort: "name" })).toEqual({ orgs: [withUser, other], noOrgUsers: [loose] })
    expect(visibleAccounts(data, { tab: "open", q: "", sort: "name" }).noOrgUsers).toEqual([])
    expect(visibleAccounts(data, { tab: "no_org", q: "", sort: "name" })).toEqual({ orgs: [], noOrgUsers: [loose] })
    expect(visibleAccounts(data, { tab: "all", q: "zephyr", sort: "name" })).toEqual({ orgs: [], noOrgUsers: [] })
  })
})

describe("parse", () => {
  const body = { status: "connected", missing: [], lastSyncedAt: at(0), lastTriedAt: null, stripeContacts: 3, orgs: [org()], noOrgUsers: [user()] }

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
  it("links Add seats only to a real subscription id in Stripe's dashboard", () => {
    expect(stripeSubscriptionUrl("sub_1AbC")).toBe("https://dashboard.stripe.com/subscriptions/sub_1AbC")
    expect(stripeSubscriptionUrl(null)).toBeNull()
    expect(stripeSubscriptionUrl("sub_../../x")).toBeNull()
    expect(stripeSubscriptionUrl("cus_123")).toBeNull()
  })

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
