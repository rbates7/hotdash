// @vitest-environment node
import type Stripe from "stripe"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/crm/db/client", () => ({ getDb: () => { throw new Error("no db in unit tests") } }))

const {
  buildAccounts,
  createAccountsService,
  missingSources,
  primarySubscription,
  slimCustomer,
  slimSubscription,
} = await import("@/lib/server/stripe-accounts")
import type {
  AccountsCustomer,
  AccountsSubscription,
  AppAccountsData,
  AppContact,
  StripeAccountsData,
} from "@/lib/server/stripe-accounts"

// Mocked Stripe objects and CRM rows: test-only, never shipped.
const NOW = Date.parse("2026-10-27T12:00:00.000Z")
const NOW_SEC = Math.floor(NOW / 1000)
const DAY = 86_400
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)

let n = 0
function sub(o: Partial<AccountsSubscription> & { interval?: string; quantity?: number; unit?: number } = {}): AccountsSubscription {
  n += 1
  const { interval = "month", quantity = 1, unit = 1_500, ...rest } = o
  const start = rest.start_date ?? sec("2025-03-04T00:00:00Z")
  return {
    id: `sub_t${n}`,
    customer: `cus_t${n}`,
    status: "active",
    currency: "usd",
    created: start,
    start_date: start,
    trial_start: null,
    trial_end: null,
    ended_at: null,
    canceled_at: null,
    price_id: null,
    product_id: null,
    discounts: [],
    items: { data: [{ quantity, price: { currency: "usd", unit_amount: unit, nickname: null, recurring: { interval, interval_count: 1 } } }] },
    ...rest,
  }
}

function customer(o: Partial<AccountsCustomer> = {}): AccountsCustomer {
  n += 1
  return { id: `cus_t${n}`, name: null, email: null, metadata: {}, ...o }
}

function contact(o: Partial<AppContact> = {}): AppContact {
  n += 1
  return {
    id: `c${n}`,
    email: `person${n}@school.test`,
    firstName: null,
    lastName: null,
    organizationId: null,
    stripeCustomerId: null,
    plan: null,
    planStatus: null,
    ...o,
  }
}

describe("mapping from Stripe objects", () => {
  it("slims a subscription: ids, status, quantity; no dates beyond the base, nothing about payment", () => {
    const raw = {
      id: "sub_X1",
      object: "subscription",
      customer: { id: "cus_X1" },
      status: "active",
      currency: "usd",
      created: 100,
      start_date: 100,
      trial_start: null,
      trial_end: null,
      ended_at: null,
      canceled_at: null,
      cancel_at: null,
      cancel_at_period_end: false,
      metadata: { org: "Ridge" },
      default_payment_method: "pm_secret",
      discounts: [],
      items: {
        data: [
          {
            quantity: 8,
            current_period_end: 200,
            price: { id: "price_1", product: "prod_1", currency: "usd", nickname: "Monthly", unit_amount: 1500, unit_amount_decimal: "1500", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } },
          },
        ],
      },
    } as unknown as Stripe.Subscription
    const s = slimSubscription(raw)
    expect(s).toMatchObject({ id: "sub_X1", customer: "cus_X1", status: "active", price_id: "price_1", product_id: "prod_1" })
    expect(s.items.data[0]!.quantity).toBe(8)
    expect(s).not.toHaveProperty("current_period_end")
    expect(s).not.toHaveProperty("cancel_at")
    expect(s).not.toHaveProperty("metadata")
    expect(JSON.stringify(s)).not.toContain("pm_secret")
  })

  it("drops deleted customers, keeps string metadata only", () => {
    expect(slimCustomer({ id: "cus_D", deleted: true } as Stripe.DeletedCustomer)).toBeNull()
    expect(slimCustomer({ id: "cus_K", name: "K", email: "k@k.test", created: 5, metadata: { org: "Ridge" } } as unknown as Stripe.Customer)).toEqual({
      id: "cus_K",
      name: "K",
      email: "k@k.test",
      metadata: { org: "Ridge" },
    })
  })

  it("the main subscription is the live one with the best status, then the oldest; else the last ended", () => {
    const older = sub({ start_date: sec("2024-01-01T00:00:00Z") })
    const newer = sub({ start_date: sec("2025-06-01T00:00:00Z") })
    const pastDue = sub({ status: "past_due", start_date: sec("2023-01-01T00:00:00Z") })
    const gone = sub({ status: "canceled", ended_at: NOW_SEC })
    const goneEarlier = sub({ status: "canceled", ended_at: NOW_SEC - 30 * DAY })
    expect(primarySubscription([newer, gone, older, pastDue])).toBe(older)
    expect(primarySubscription([pastDue, gone])).toBe(pastDue)
    expect(primarySubscription([goneEarlier, gone])).toBe(gone)
    expect(primarySubscription([])).toBeNull()
  })
})

describe("buildAccounts", () => {
  function fixture() {
    const acmeCus = customer()
    const acmeSub = sub({ customer: acmeCus.id, quantity: 8, unit: 1_500, start_date: sec("2025-03-04T00:00:00Z") })
    const metaCus = customer({ metadata: { School: "Ridge Academy" } })
    const metaSub = sub({ customer: metaCus.id, quantity: 3, interval: "year", unit: 18_000 })
    const lapsedCus = customer()
    const lapsedSub = sub({ customer: lapsedCus.id, quantity: 3, status: "canceled", ended_at: NOW_SEC - 27 * DAY })
    const looseCus = customer()
    const payerCus = customer({ metadata: { organization: "acme robotics" } })
    const payerSub = sub({ customer: payerCus.id, quantity: 2, start_date: sec("2025-08-01T00:00:00Z") })
    const stripe: StripeAccountsData = {
      customers: [acmeCus, metaCus, lapsedCus, looseCus, payerCus],
      subscriptions: [acmeSub, metaSub, lapsedSub, payerSub],
    }
    const app: AppAccountsData = {
      orgs: [
        { id: "org-acme", name: "Acme Robotics", domain: "acme.test" },
        { id: "org-birch", name: "Birchwood Labs", domain: null },
        { id: "org-empty", name: "Empty Org", domain: null },
      ],
      contacts: [
        contact({ firstName: "Jordan", lastName: "Price", organizationId: "org-acme", stripeCustomerId: acmeCus.id, plan: "Monthly", planStatus: "active" }),
        contact({ firstName: "Sam", organizationId: "org-acme" }),
        contact({ email: "ri@ridge.test", stripeCustomerId: metaCus.id }),
        contact({ email: "bw@birch.test", organizationId: "org-birch", stripeCustomerId: lapsedCus.id }),
        contact({ firstName: "Greg", lastName: "Tan", email: "greg@gmail.test", stripeCustomerId: looseCus.id }),
        contact({ email: "gmail-only@sender.test" }),
      ],
      openCasesByOrg: new Map([["org-acme", 2]]),
    }
    return { stripe, app, acmeSub, metaSub, payerSub }
  }

  it("orgs come back A to Z by name", () => {
    const { stripe, app } = fixture()
    expect(buildAccounts(stripe, app, NOW_SEC).orgs.map((o) => o.name)).toEqual(["Acme Robotics", "Birchwood Labs", "Empty Org", "Ridge Academy"])
  })

  it("groups users by CRM org, A to Z; plan, status and MRR from its subscriptions", () => {
    const { stripe, app, acmeSub, payerSub } = fixture()
    const out = buildAccounts(stripe, app, NOW_SEC)
    const acme = out.orgs.find((o) => o.id === "org-acme")!
    expect(acme.users.map((u) => u.name)).toEqual(["Jordan Price", "Sam"])
    expect(acme.users[0]).toEqual({ id: expect.any(String), name: "Jordan Price", email: expect.any(String), organization: "Acme Robotics", plan: "Monthly", planStatus: "active" })
    // Its contact's sub is the oldest live one; a payer whose metadata names it (by name) adds MRR.
    expect(acme.stripeCustomerId).toBe(acmeSub.customer)
    expect(payerSub.customer).not.toBe(acme.stripeCustomerId)
    expect(acme.mrrCents).toBe(8 * 1_500 + 2 * 1_500)
    expect(acme.openCases).toBe(2)
    expect(acme).toMatchObject({ status: "active", canceled: false, domain: "acme.test" })
    for (const key of ["seatsUsed", "seatsTotal", "subscriptionId", "customerSince", "renewsAt", "termMonths"]) expect(acme).not.toHaveProperty(key)
  })

  it("an org named only in Stripe metadata gets its own row", () => {
    const { stripe, app } = fixture()
    const ridge = buildAccounts(stripe, app, NOW_SEC).orgs.find((o) => o.name === "Ridge Academy")!
    expect(ridge.id).toBe("meta-ridge-academy")
    expect(ridge).toMatchObject({ domain: "ridge.test", status: "active", canceled: false })
    expect(ridge.users.map((u) => u.email)).toEqual(["ri@ridge.test"])
    expect(ridge.mrrCents).toBe(Math.round((3 * 18_000) / 12))
  })

  it("a canceled org has no MRR; an org with no subscription has no plan", () => {
    const { stripe, app } = fixture()
    const out = buildAccounts(stripe, app, NOW_SEC)
    const birch = out.orgs.find((o) => o.id === "org-birch")!
    expect(birch).toMatchObject({ canceled: true, status: "canceled", mrrCents: 0 })
    const empty = out.orgs.find((o) => o.id === "org-empty")!
    expect(empty).toMatchObject({ users: [], status: "none", plan: null, stripeCustomerId: null, openCases: 0 })
  })

  it("No organization: Stripe-linked contacts with no org; Gmail-only senders are not users", () => {
    const { stripe, app } = fixture()
    const out = buildAccounts(stripe, app, NOW_SEC)
    expect(out.noOrgUsers.map((u) => u.email)).toEqual(["greg@gmail.test"])
    expect(out.noOrgUsers[0]).toMatchObject({ name: "Greg Tan", organization: null })
    expect(out.stripeContacts).toBe(4)
  })

  it("open cases are null (Not connected) when cases could not be read", () => {
    const { stripe, app } = fixture()
    const out = buildAccounts(stripe, { ...app, openCasesByOrg: null }, NOW_SEC)
    expect(out.orgs.every((o) => o.openCases === null)).toBe(true)
  })

  it("a trialing subscription is the Trial plan with no MRR", () => {
    const cus = customer({ metadata: { org: "Lakeview" } })
    const out = buildAccounts(
      { customers: [cus], subscriptions: [sub({ customer: cus.id, status: "trialing", trial_end: NOW_SEC + 13 * DAY })] },
      { orgs: [], contacts: [], openCasesByOrg: null },
      NOW_SEC
    )
    expect(out.orgs[0]).toMatchObject({ name: "Lakeview", plan: "Trial", status: "trialing", mrrCents: 0, users: [] })
  })
})

describe("Not connected handling", () => {
  const KEY_ENV = { STRIPE_READONLY_KEY: "rk_test_abc123", CRM_DATABASE_URL: "postgres://db.test/crm" }
  const emptyStripe: StripeAccountsData = { customers: [], subscriptions: [] }
  const emptyApp: AppAccountsData = { orgs: [], contacts: [], openCasesByOrg: new Map() }

  it("names the sources that are not set up, without reading their values out", () => {
    expect(missingSources({})).toEqual(["stripe", "database"])
    expect(missingSources({ STRIPE_READONLY_KEY: "not-a-key", DATABASE_URL: "postgres://x" })).toEqual(["stripe"])
    expect(missingSources(KEY_ENV)).toEqual([])
  })

  it("without a key it is not_connected and never calls Stripe", async () => {
    const loadStripe = vi.fn()
    const svc = createAccountsService({ env: () => ({ CRM_DATABASE_URL: "postgres://x" }), loadStripe, loadApp: vi.fn() })
    expect(await svc.read()).toMatchObject({ status: "not_connected", missing: ["stripe"], orgs: [] })
    expect(loadStripe).not.toHaveBeenCalled()
  })

  it("connecting until the first read lands, then connected; cached for the TTL", async () => {
    let t = NOW
    const loadStripe = vi.fn(async () => emptyStripe)
    const loadApp = vi.fn(async () => emptyApp)
    const svc = createAccountsService({ env: () => KEY_ENV, loadStripe, loadApp, clock: () => t })
    expect((await svc.read()).status).toBe("connecting")
    await svc.settled()
    expect(await svc.read()).toMatchObject({ status: "connected", lastSyncedAt: new Date(NOW).toISOString() })
    t += 60_000
    await svc.read()
    expect(loadStripe).toHaveBeenCalledTimes(1)
    t += 5 * 60_000
    await svc.read()
    await svc.settled()
    expect(loadStripe).toHaveBeenCalledTimes(2)
  })

  it("a failed first read is not_connected with when it was tried, logging a word, never the message", async () => {
    const log = vi.fn()
    const svc = createAccountsService({
      env: () => KEY_ENV,
      loadStripe: async () => {
        throw Object.assign(new Error("Invalid API Key provided: rk_test_abc123"), { type: "StripeAuthenticationError" })
      },
      loadApp: async () => emptyApp,
      clock: () => NOW,
      log,
    })
    await svc.read()
    await svc.settled()
    const body = await svc.read()
    expect(body).toMatchObject({ status: "not_connected", lastTriedAt: new Date(NOW).toISOString(), orgs: [] })
    expect(log).toHaveBeenCalledWith("StripeAuthenticationError")
    expect(JSON.stringify(body)).not.toContain("rk_test")
  })

  it("a database failure is not_connected too", async () => {
    const log = vi.fn()
    const svc = createAccountsService({
      env: () => KEY_ENV,
      loadStripe: async () => emptyStripe,
      loadApp: async () => {
        throw new Error("connect ECONNREFUSED postgres://user:pw@db")
      },
      clock: () => NOW,
      log,
    })
    await svc.read()
    await svc.settled()
    expect((await svc.read()).status).toBe("not_connected")
    expect(log).toHaveBeenCalledWith("UnknownError")
  })

  it("after a good read, a failure keeps the last copy as stale", async () => {
    let t = NOW
    let fail = false
    const svc = createAccountsService({
      env: () => KEY_ENV,
      loadStripe: async () => {
        if (fail) throw new Error("down")
        return emptyStripe
      },
      loadApp: async () => ({ ...emptyApp, orgs: [{ id: "o1", name: "Kept", domain: null }] }),
      clock: () => t,
      log: () => {},
    })
    await svc.read()
    await svc.settled()
    fail = true
    t += 6 * 60_000
    await svc.read()
    await svc.settled()
    const body = await svc.read()
    expect(body.status).toBe("stale")
    expect(body.orgs.map((o) => o.name)).toEqual(["Kept"])
    expect(body.lastTriedAt).toBe(new Date(t).toISOString())
  })

  it("detail answers one org from the same copy, or null", async () => {
    const svc = createAccountsService({
      env: () => KEY_ENV,
      loadStripe: async () => emptyStripe,
      loadApp: async () => ({ ...emptyApp, orgs: [{ id: "o1", name: "One", domain: null }] }),
      clock: () => NOW,
    })
    expect(await svc.detail("o1")).toMatchObject({ status: "connecting", org: null })
    await svc.settled()
    expect((await svc.detail("o1")).org?.name).toBe("One")
    expect((await svc.detail("nope")).org).toBeNull()
  })
})
