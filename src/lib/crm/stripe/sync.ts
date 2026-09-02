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

/**
 * When a plan started and, if it has, when it stopped.
 *
 * Paying starts when the trial ends: a subscription still in its trial has
 * a start in the future and only counts as new once that day has passed.
 * A plan with no trial starts on its start date. Churn is dated by when the
 * plan actually stopped — a cancellation scheduled for the end of the
 * period is still paying until then, so it has no end date yet.
 */
export function planDatesFor(subscription: StripeSubscription): {
  planStartedAt: Date
  planEndedAt: Date | null
} {
  const startedSeconds = subscription.trialEnd ?? subscription.startDate
  const endedSeconds =
    subscription.endedAt ??
    (subscription.status === "canceled" ? subscription.canceledAt : null)
  return {
    planStartedAt: new Date(startedSeconds * 1000),
    planEndedAt: endedSeconds == null ? null : new Date(endedSeconds * 1000),
  }
}

function sameInstant(a: Date | null, b: Date | null) {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null)
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
    const dates = planDatesFor(subscription)
    // The dates are part of this comparison on purpose: leaving them out
    // would mean a customer whose plan never changed never gets them.
    if (
      contact.plan === plan &&
      contact.planStatus === planStatus &&
      sameInstant(contact.planStartedAt, dates.planStartedAt) &&
      sameInstant(contact.planEndedAt, dates.planEndedAt)
    ) {
      continue
    }
    db.update(contacts)
      .set({ plan, planStatus, ...dates, updatedAt: new Date() })
      .where(eq(contacts.id, contact.id))
      .run()
    stats.plansSet += 1
  }

  return stats
}
