import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/contacts/server"
import { createDb, type Db } from "@/lib/db/client"
import { contacts } from "@/lib/db/schema"

import { syncStripe } from "./sync"
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
        {
          customerId: "cus_1",
          status: "active",
          priceId: "price_growth",
          productId: "prod_1",
          nickname: "Growth",
          created: 100,
        },
      ]
    )
    const stats = await syncStripe(db, api)

    expect(stats).toEqual({
      customersSeen: 2,
      contactsCreated: 1,
      contactsUpdated: 0,
      plansSet: 1,
    })
    const contact = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "dana@acme.com"))
      .get()!
    expect(contact.stripeCustomerId).toBe("cus_1")
    expect(contact.firstName).toBe("Dana")
    expect(contact.nameSource).toBe("stripe")
    expect(contact.plan).toBe("Growth")
    expect(contact.planStatus).toBe("active")
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

    const dana = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "dana@acme.com"))
      .get()!
    expect(dana.firstName).toBe("Manually") // manual survives
    expect(dana.stripeCustomerId).toBe("cus_dana")

    const tom = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "tom@x.io"))
      .get()!
    expect(tom.firstName).toBe("Tom") // gmail loses to stripe
    expect(tom.lastName).toBe("Alvarez")
    expect(tom.nameSource).toBe("stripe")
  })

  it("prefers the most representative subscription and is idempotent", async () => {
    const api = fakeApi(
      [{ id: "cus_1", email: "a@b.co", name: null }],
      [
        {
          customerId: "cus_1",
          status: "canceled",
          priceId: "price_old",
          productId: null,
          nickname: "Old",
          created: 50,
        },
        {
          customerId: "cus_1",
          status: "active",
          priceId: "price_new",
          productId: null,
          nickname: "New",
          created: 80,
        },
      ]
    )
    await syncStripe(db, api)
    const first = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "a@b.co"))
      .get()!
    expect(first.plan).toBe("New")
    expect(first.planStatus).toBe("active")

    const stats = await syncStripe(db, api)
    expect(stats.contactsCreated).toBe(0)
    expect(stats.contactsUpdated).toBe(0)
    expect(stats.plansSet).toBe(0)
  })
})
