import { eq } from "drizzle-orm"

import { normalizeEmail, splitDisplayName } from "@/lib/crm/contacts/matching"
import {
  createContact,
  enrichContactName,
  findContactByEmail,
} from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"
import { contacts, type Contact } from "@/lib/crm/db/schema"

import { planLabelFor } from "./plan-map"
import type { StripeApi, StripeSubscription, StripeSyncStats } from "./types"

// Statuses that best represent "the plan this customer is on" when a
// customer has several subscriptions.
const STATUS_RANK: Record<string, number> = {
  active: 6,
  trialing: 5,
  past_due: 4,
  unpaid: 3,
  incomplete: 2,
  paused: 2,
  canceled: 1,
  incomplete_expired: 0,
}

function findContactByStripeId(db: Db, stripeCustomerId: string) {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.stripeCustomerId, stripeCustomerId))
    .get()
}

// Full-scan poll: idempotent, no cursor edge cases, cheap at small-SaaS
// scale. A created[gt] cursor is a documented future optimization.
export async function syncStripe(
  db: Db,
  api: StripeApi
): Promise<StripeSyncStats> {
  const stats: StripeSyncStats = {
    customersSeen: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    plansSet: 0,
  }

  for await (const customer of api.listCustomers()) {
    stats.customersSeen += 1
    if (!customer.email) continue
    const email = normalizeEmail(customer.email)
    const name = splitDisplayName(customer.name)

    let contact: Contact | undefined =
      findContactByStripeId(db, customer.id) ?? findContactByEmail(db, email)

    if (!contact) {
      contact = createContact(db, {
        email,
        ...name,
        nameSource: "stripe",
        source: "stripe",
        stripeCustomerId: customer.id,
      })
      stats.contactsCreated += 1
      continue
    }

    let updated = false
    if (!contact.stripeCustomerId) {
      db.update(contacts)
        .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id))
        .run()
      updated = true
    }
    const enriched = enrichContactName(db, contact, {
      firstName: name.firstName,
      lastName: name.lastName,
      source: "stripe",
    })
    if (enriched !== contact) updated = true
    if (updated) stats.contactsUpdated += 1
  }

  // Pick the most representative subscription per customer.
  const bestByCustomer = new Map<string, StripeSubscription>()
  for await (const subscription of api.listSubscriptions()) {
    const current = bestByCustomer.get(subscription.customerId)
    if (!current) {
      bestByCustomer.set(subscription.customerId, subscription)
      continue
    }
    const currentRank = STATUS_RANK[current.status] ?? 0
    const nextRank = STATUS_RANK[subscription.status] ?? 0
    if (
      nextRank > currentRank ||
      (nextRank === currentRank && subscription.created > current.created)
    ) {
      bestByCustomer.set(subscription.customerId, subscription)
    }
  }

  for (const [customerId, subscription] of bestByCustomer) {
    const contact = findContactByStripeId(db, customerId)
    if (!contact) continue
    const plan = planLabelFor(subscription)
    const planStatus = subscription.status
    if (contact.plan === plan && contact.planStatus === planStatus) continue
    db.update(contacts)
      .set({ plan, planStatus, updatedAt: new Date() })
      .where(eq(contacts.id, contact.id))
      .run()
    stats.plansSet += 1
  }

  return stats
}
