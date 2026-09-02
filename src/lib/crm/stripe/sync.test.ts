import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { contacts } from "@/lib/crm/db/schema"

import { planDatesFor, syncStripe } from "./sync"
import type {
  StripeApi,
  StripeCustomer,
  StripeSubscription,
} from "./types"

function fakeApi(
  customers: StripeCustomer[],
  subscriptions: StripeSubscription[]
): StripeApi {
  return {
    async *listCustomers() {
      yield* customers
    },
    async *listSubscriptions() {
      yield* subscriptions
    },
  }
}

/** A plain active subscription with no trial; override what the test is about. */
function subscription(
  overrides: Partial<StripeSubscription> & { customerId: string }
): StripeSubscription {
  return {
    status: "active",
    priceId: null,
    productId: null,
    nickname: null,
    created: 100,
    startDate: 100,
    trialEnd: null,
    canceledAt: null,
    endedAt: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  }
}

function contactByEmail(db: Db, email: string) {
  return db.select().from(contacts).where(eq(contacts.email, email)).get()!
}

describe("planDatesFor", () => {
  it("starts paying when the trial ends, or on the start date without one", () => {
    expect(
      planDatesFor(subscription({ customerId: "c", startDate: 1_000, trialEnd: 5_000 }))
    ).toEqual({ planStartedAt: new Date(5_000_000), planEndedAt: null })
    expect(
      planDatesFor(subscription({ customerId: "c", startDate: 1_000 }))
    ).toEqual({ planStartedAt: new Date(1_000_000), planEndedAt: null })
  })

  it("dates churn by when the plan stopped", () => {
    expect(
      planDatesFor(
        subscription({
          customerId: "c",
          status: "canceled",
          canceledAt: 7_000,
          endedAt: 8_000,
        })
      ).planEndedAt
    ).toEqual(new Date(8_000_000))
    // Stripe normally fills ended_at for a canceled subscription; fall back
    // to canceled_at if it ever does not.
    expect(
      planDatesFor(
        subscription({ customerId: "c", status: "canceled", canceledAt: 7_000 })
      ).planEndedAt
    ).toEqual(new Date(7_000_000))
  })

  it("a cancellation scheduled for the end of the period is still paying", () => {
    // Stripe sets canceled_at the moment the cancellation is scheduled, long
    // before the plan stops. That must not read as churn.
    expect(
      planDatesFor(
        subscription({
          customerId: "c",
          status: "active",
          canceledAt: 7_000,
          cancelAtPeriodEnd: true,
        })
      ).planEndedAt
    ).toBeNull()
  })
})

describe("syncStripe", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
  })

  it("creates contacts for new customers and sets plans", async () => {
    const api = fakeApi(
      [
        { id: "cus_1", email: "Dana@Acme.com", name: "Dana Whitfield" },
        { id: "cus_2", email: null, name: "No Email" },
      ],
      [
        subscription({
          customerId: "cus_1",
          status: "active",
          priceId: "price_growth",
          productId: "prod_1",
          nickname: "Growth",
          created: 100,
          startDate: 100,
        }),
      ]
    )
    const stats = await syncStripe(db, api)

    expect(stats).toEqual({
      customersSeen: 2,
      contactsCreated: 1,
      contactsUpdated: 0,
      plansSet: 1,
    })
    const contact = contactByEmail(db, "dana@acme.com")
    expect(contact.stripeCustomerId).toBe("cus_1")
    expect(contact.firstName).toBe("Dana")
    expect(contact.nameSource).toBe("stripe")
    expect(contact.plan).toBe("Growth")
    expect(contact.planStatus).toBe("active")
    expect(contact.planStartedAt).toEqual(new Date(100_000))
    expect(contact.planEndedAt).toBeNull()
  })

  it("links stripe ids to existing contacts and respects name precedence", async () => {
    createContact(db, {
      email: "dana@acme.com",
      firstName: "Manually",
      lastName: "Named",
      nameSource: "manual",
      source: "manual",
    })
    createContact(db, {
      email: "tom@x.io",
      firstName: "Tommy",
      nameSource: "gmail",
      source: "gmail",
    })

    const api = fakeApi(
      [
        { id: "cus_dana", email: "dana@acme.com", name: "Dana Whitfield" },
        { id: "cus_tom", email: "tom@x.io", name: "Tom Alvarez" },
      ],
      []
    )
    const stats = await syncStripe(db, api)
    expect(stats.contactsCreated).toBe(0)
    expect(stats.contactsUpdated).toBe(2)

    const dana = contactByEmail(db, "dana@acme.com")
    expect(dana.firstName).toBe("Manually") // manual survives
    expect(dana.stripeCustomerId).toBe("cus_dana")

    const tom = contactByEmail(db, "tom@x.io")
    expect(tom.firstName).toBe("Tom") // gmail loses to stripe
    expect(tom.lastName).toBe("Alvarez")
    expect(tom.nameSource).toBe("stripe")
  })

  it("prefers the most representative subscription and is idempotent", async () => {
    const api = fakeApi(
      [{ id: "cus_1", email: "a@b.co", name: null }],
      [
        subscription({
          customerId: "cus_1",
          status: "canceled",
          priceId: "price_old",
          nickname: "Old",
          created: 50,
          startDate: 50,
          canceledAt: 70,
          endedAt: 70,
        }),
        subscription({
          customerId: "cus_1",
          status: "active",
          priceId: "price_new",
          nickname: "New",
          created: 80,
          startDate: 80,
        }),
      ]
    )
    await syncStripe(db, api)
    const first = contactByEmail(db, "a@b.co")
    expect(first.plan).toBe("New")
    expect(first.planStatus).toBe("active")
    // The dates follow the subscription that was picked, not the older one.
    expect(first.planStartedAt).toEqual(new Date(80_000))
    expect(first.planEndedAt).toBeNull()

    const stats = await syncStripe(db, api)
    expect(stats.contactsCreated).toBe(0)
    expect(stats.contactsUpdated).toBe(0)
    expect(stats.plansSet).toBe(0)
  })

  it("dates a trial from when paying starts, and churn from when it stopped", async () => {
    const api = fakeApi(
      [
        { id: "cus_trial", email: "trial@b.co", name: null },
        { id: "cus_gone", email: "gone@b.co", name: null },
      ],
      [
        subscription({
          customerId: "cus_trial",
          status: "trialing",
          startDate: 1_000,
          trialEnd: 2_000,
        }),
        subscription({
          customerId: "cus_gone",
          status: "canceled",
          startDate: 1_000,
          canceledAt: 3_000,
          endedAt: 4_000,
        }),
      ]
    )
    await syncStripe(db, api)
    const trial = contactByEmail(db, "trial@b.co")
    expect(trial.planStartedAt).toEqual(new Date(2_000_000))
    expect(trial.planEndedAt).toBeNull()
    const gone = contactByEmail(db, "gone@b.co")
    expect(gone.planStartedAt).toEqual(new Date(1_000_000))
    expect(gone.planEndedAt).toEqual(new Date(4_000_000))
  })

  it("rewrites the dates when only they changed", async () => {
    // A scheduled cancellation: same plan, same status, no end date yet.
    const pending = subscription({
      customerId: "cus_1",
      status: "active",
      nickname: "Monthly",
      startDate: 1_000,
      canceledAt: 5_000,
      cancelAtPeriodEnd: true,
    })
    await syncStripe(db, fakeApi([{ id: "cus_1", email: "a@b.co", name: null }], [pending]))
    expect(contactByEmail(db, "a@b.co").planEndedAt).toBeNull()

    // The trial gets extended: plan and status unchanged, start date moves.
    // Without the dates in the idempotency check this run would be a no-op.
    const extended = subscription({
      customerId: "cus_1",
      status: "active",
      nickname: "Monthly",
      startDate: 1_000,
      trialEnd: 9_000,
    })
    const stats = await syncStripe(
      db,
      fakeApi([{ id: "cus_1", email: "a@b.co", name: null }], [extended])
    )
    expect(stats.plansSet).toBe(1)
    expect(contactByEmail(db, "a@b.co").planStartedAt).toEqual(new Date(9_000_000))
  })
})
