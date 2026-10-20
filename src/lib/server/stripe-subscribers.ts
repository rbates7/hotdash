import "server-only"

import Stripe from "stripe"

import { failureKind, readStripeConfig, stripeService, type StripeService } from "@/lib/server/stripe"
import {
  emptySubscriberList,
  pickSubscribers,
  type StripeSubscriberListResponse,
  type SubscriberList,
} from "@/lib/stripe-subscribers"

/**
 * The New and Churned lists, server only. Built from the Stripe sync's copy
 * (no extra list calls) plus one read-only `customers.retrieve` per row for
 * the name and email. Both caches are short: a list for `LIST_TTL_MS` per
 * list and zone (and sync), a customer for `CUSTOMER_TTL_MS`. Names and
 * emails are never logged; a failed lookup logs a word and leaves them null.
 */
export const LIST_TTL_MS = 2 * 60_000
export const CUSTOMER_TTL_MS = 2 * 60_000
/** At most this many customers are held; the oldest go first. */
export const CUSTOMER_CACHE_MAX = 500

export type Customer = { name: string | null; email: string | null }
export type CustomerLookup = (id: string) => Promise<Customer>

export const lookupCustomerFromStripe: CustomerLookup = async (id) => {
  const config = readStripeConfig()
  if (config.kind !== "ok") return { name: null, email: null }
  const stripe = new Stripe(config.key, {
    maxNetworkRetries: 1,
    timeout: 10_000,
    telemetry: false,
    appInfo: { name: "hotdash-founder-dashboard" },
    ...(config.base ?? {}),
  })
  const c = await stripe.customers.retrieve(id)
  if ("deleted" in c && c.deleted) return { name: null, email: null }
  return { name: (c as Stripe.Customer).name ?? null, email: (c as Stripe.Customer).email ?? null }
}

export function createSubscriberLists({
  service = stripeService,
  lookup = lookupCustomerFromStripe,
  clock = () => Date.now(),
  listTtlMs = LIST_TTL_MS,
  customerTtlMs = CUSTOMER_TTL_MS,
  customerMax = CUSTOMER_CACHE_MAX,
  log = (kind: string) => console.warn(`[stripe] customer lookup failed: ${kind}`),
}: {
  service?: Pick<StripeService, "snapshot">
  lookup?: CustomerLookup
  clock?: () => number
  listTtlMs?: number
  customerTtlMs?: number
  customerMax?: number
  log?: (kind: string) => void
} = {}) {
  const lists = new Map<string, { at: number; body: StripeSubscriberListResponse }>()
  const customers = new Map<string, { at: number; value: Customer }>()

  /** After a successful lookup only: drop expired customers, then the oldest beyond `customerMax`. */
  function pruneCustomers() {
    const now = clock()
    for (const [k, v] of customers) if (now - v.at >= customerTtlMs) customers.delete(k)
    for (const k of customers.keys()) {
      if (customers.size <= customerMax) break
      customers.delete(k)
    }
  }

  async function customer(id: string | null): Promise<Customer> {
    if (!id) return { name: null, email: null }
    const hit = customers.get(id)
    if (hit && clock() - hit.at < customerTtlMs) return hit.value
    try {
      const value = await lookup(id)
      customers.delete(id) // re-insert so Map order stays oldest-first
      customers.set(id, { at: clock(), value })
      pruneCustomers()
      return value
    } catch (error) {
      log(failureKind(error)) // a word only: never the id, name, email or message
      return { name: null, email: null }
    }
  }

  return {
    async read(list: SubscriberList, timeZone: string): Promise<StripeSubscriberListResponse> {
      const snap = await service.snapshot()
      if (!("data" in snap)) return emptySubscriberList(list, snap.status)
      const key = `${list}|${timeZone}|${snap.syncedAt}|${snap.status}`
      const hit = lists.get(key)
      if (hit && clock() - hit.at < listTtlMs) return hit.body
      const { window, total, picks } = pickSubscribers(snap.data.subscriptions, list, {
        now: new Date(snap.syncedAt),
        timeZone,
      })
      const rows = await Promise.all(
        picks.map(async ({ customerId, ...rest }) => {
          const c = await customer(customerId)
          return { ...rest, customerName: c.name, customerEmail: c.email }
        })
      )
      const body: StripeSubscriberListResponse = {
        status: snap.status,
        lastSyncedAt: new Date(snap.syncedAt).toISOString(),
        list,
        window,
        total,
        rows,
      }
      for (const [k, v] of lists) if (clock() - v.at >= listTtlMs) lists.delete(k)
      lists.set(key, { at: clock(), body })
      return body
    },
    /**
     * Tests only: how many customers are held. Not part of the service's
     * contract; no route or component may call it.
     * @internal
     */
    customerCacheSize() {
      return customers.size
    },
    reset() {
      lists.clear()
      customers.clear()
    },
  }
}

/** The one list cache for this server process. */
export const subscriberLists = createSubscriberLists()
