// @vitest-environment node
import http from "node:http"
import type { AddressInfo } from "node:net"

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CACHE_TTL_MS,
  RETRY_AFTER_MS,
  createStripeService,
  failureKind,
  firstPaidBySubscription,
  loadFromStripe,
  readStripeConfig,
  type Loader,
} from "@/lib/server/stripe"
import type { StripeData } from "@/lib/stripe-metrics"
import { NOT_CONNECTED } from "@/lib/stripe-summary"

/** Fake keys: shaped like Stripe's, valid nowhere. */
const KEY = "rk_test_hotdashUnitTestOnly000"
const ENV = { STRIPE_READONLY_KEY: KEY, NODE_ENV: "test" }
const NOW = new Date("2026-10-14T17:00:00.000Z")
const NOW_SEC = NOW.getTime() / 1000

const DATA: StripeData = {
  subscriptions: [
    {
      id: "sub_1",
      status: "active",
      currency: "usd",
      created: NOW_SEC - 90 * 86_400,
      start_date: NOW_SEC - 90 * 86_400,
      trial_start: null,
      trial_end: null,
      ended_at: null,
      first_paid_at: NOW_SEC - 90 * 86_400,
      items: { data: [{ price: { currency: "usd", unit_amount: 4_900, recurring: { interval: "month", interval_count: 1 } } }] },
    },
  ],
  charges: [{ id: "ch_1", amount: 4_900, currency: "usd", status: "succeeded", captured: true, created: NOW_SEC - 60 }],
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

function service(load: Loader, env: Record<string, string | undefined> = ENV) {
  const log = vi.fn()
  const svc = createStripeService({ env: () => env, load, log })
  return { svc, log }
}

/* ---------------------------------------------------------------- config */

describe("readStripeConfig", () => {
  it("is missing with no key, and invalid unless the key is rk_/sk_", () => {
    expect(readStripeConfig({})).toEqual({ kind: "missing" })
    expect(readStripeConfig({ STRIPE_READONLY_KEY: "  " })).toEqual({ kind: "missing" })
    for (const bad of ["pk_live_abc", "whsec_abc", "rk_abc", "sk_live_", "rk_live_abc def", "Bearer rk_live_abc"]) {
      expect(readStripeConfig({ STRIPE_READONLY_KEY: bad })).toEqual({ kind: "invalid" })
    }
    expect(readStripeConfig({ STRIPE_READONLY_KEY: KEY })).toEqual({ kind: "ok", key: KEY, base: null })
    expect(readStripeConfig({ STRIPE_READONLY_KEY: "sk_live_abc123" })).toMatchObject({ kind: "ok" })
  })

  it("only takes a loopback mock base, and only outside production unless allowed", () => {
    const base = { STRIPE_READONLY_KEY: KEY, STRIPE_API_BASE: "http://127.0.0.1:12111" }
    expect(readStripeConfig({ ...base, NODE_ENV: "development" })).toEqual({
      kind: "ok",
      key: KEY,
      base: { host: "127.0.0.1", port: 12111, protocol: "http" },
    })
    // A production build refuses it — and refuses to call anything at all.
    expect(readStripeConfig({ ...base, NODE_ENV: "production" })).toEqual({ kind: "invalid" })
    expect(readStripeConfig({ ...base, NODE_ENV: "production", STRIPE_ALLOW_MOCK_BASE: "1" })).toMatchObject({ kind: "ok" })
    // Never a non-loopback host: the key would go there.
    expect(readStripeConfig({ ...base, STRIPE_API_BASE: "https://evil.example.com", NODE_ENV: "test" })).toEqual({ kind: "invalid" })
    expect(readStripeConfig({ ...base, STRIPE_API_BASE: "not a url", NODE_ENV: "test" })).toEqual({ kind: "invalid" })
  })
})

/* ----------------------------------------------------------------- cache */

describe("cache", () => {
  it("serves one sync for 5 minutes, then reads Stripe again", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load)

    const first = await svc.summary("America/Chicago")
    expect(first.status).toBe("connected")
    expect(first.lastSyncedAt).toBe(NOW.toISOString())
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    await svc.summary("America/Chicago")
    await svc.summary("UTC")
    await svc.health()
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    const later = await svc.summary("America/Chicago")
    expect(load).toHaveBeenCalledTimes(2)
    expect(later.lastSyncedAt).toBe(new Date(NOW.getTime() + CACHE_TTL_MS).toISOString())
  })

  it("concurrent requests share one in-flight sync", async () => {
    let release!: () => void
    const load = vi.fn<Loader>(() => new Promise((r) => (release = () => r(DATA))))
    const { svc } = service(load)
    const reads = Promise.all([svc.summary("UTC"), svc.summary("America/Chicago"), svc.health()] as const)
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    release()
    const [a, b, h] = await reads
    expect(a.status).toBe("connected")
    expect(b.status).toBe("connected")
    expect(h).toBe("ok")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("computes per time zone from the same copy", async () => {
    const { svc } = service(async () => DATA)
    const ct = await svc.summary("America/Chicago")
    const utc = await svc.summary("UTC")
    expect(ct.metrics!.cashThisWeek.since).toBe("2026-10-12T05:00:00.000Z")
    expect(utc.metrics!.cashThisWeek.since).toBe("2026-10-12T00:00:00.000Z")
  })
})

/* -------------------------------------------------------------- fallback */

describe("fallback", () => {
  it("never synced and Stripe fails → not_connected, no error text", async () => {
    const { svc, log } = service(async () => {
      throw Object.assign(new Error(`Invalid API Key provided: ${KEY}`), { type: "StripeAuthenticationError" })
    })
    expect(await svc.summary("UTC")).toEqual(NOT_CONNECTED)
    expect(await svc.health()).toBe("unavailable")
    expect(log).toHaveBeenCalledWith("StripeAuthenticationError")
    // The log never carries the key (or any of the message).
    expect(JSON.stringify(log.mock.calls)).not.toContain(KEY)
  })

  it("a failure after a good sync → stale, with the last good figures and their time", async () => {
    let fail = false
    const load = vi.fn<Loader>(async () => {
      if (fail) throw Object.assign(new Error("boom"), { type: "StripeConnectionError" })
      return DATA
    })
    const { svc } = service(load)
    const good = await svc.summary("UTC")

    fail = true
    vi.advanceTimersByTime(CACHE_TTL_MS)
    const stale = await svc.summary("UTC")
    expect(stale.status).toBe("stale")
    expect(stale.lastSyncedAt).toBe(good.lastSyncedAt)
    expect(stale.metrics).toEqual(good.metrics)
    expect(await svc.health()).toBe("unavailable")

    // A failure is retried after a minute, not on every request.
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(RETRY_AFTER_MS - 1)
    await svc.summary("UTC")
    expect(load).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    fail = false
    const back = await svc.summary("UTC")
    expect(load).toHaveBeenCalledTimes(3)
    expect(back.status).toBe("connected")
    expect(back.lastSyncedAt).not.toBe(good.lastSyncedAt)
  })

  it("missing key → not_connected / not_configured, and Stripe is never called", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load, {})
    expect(await svc.summary("UTC")).toEqual(NOT_CONNECTED)
    expect(await svc.health()).toBe("not_configured")
    expect(load).not.toHaveBeenCalled()
  })

  it("invalid key → refuses to call Stripe at all", async () => {
    const load = vi.fn<Loader>(async () => DATA)
    const { svc } = service(load, { STRIPE_READONLY_KEY: "pk_live_publishable_not_secret" })
    expect(await svc.summary("UTC")).toEqual(NOT_CONNECTED)
    expect(await svc.health()).toBe("not_configured")
    expect(load).not.toHaveBeenCalled()
  })

  it("the key removed after a good sync → stale with the last figures", async () => {
    const env: Record<string, string | undefined> = { ...ENV }
    const { svc } = service(async () => DATA, env)
    const good = await svc.summary("UTC")
    delete env.STRIPE_READONLY_KEY
    const after = await svc.summary("UTC")
    expect(after).toMatchObject({ status: "stale", lastSyncedAt: good.lastSyncedAt })
    expect(await svc.health()).toBe("not_configured")
  })

  it("data that cannot be computed is a failed sync, not a crash", async () => {
    const { svc, log } = service(async () => ({ subscriptions: null, charges: [] }) as unknown as StripeData)
    expect(await svc.summary("UTC")).toEqual(NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("InvalidData")
  })

  it("failureKind names Stripe error classes only, never a message", () => {
    expect(failureKind({ type: "StripeRateLimitError", message: KEY })).toBe("StripeRateLimitError")
    expect(failureKind(new Error(KEY))).toBe("UnknownError")
    expect(failureKind({ type: KEY })).toBe("UnknownError")
    expect(failureKind(null)).toBe("UnknownError")
  })
})

/* ------------------------------------------------- first paid invoice */

describe("firstPaidBySubscription", () => {
  const inv = (sub: string | { id: string } | null, amount_paid: number, paid_at: number | null, created = 1_000) => ({
    amount_paid,
    created,
    status_transitions: { paid_at },
    parent: { subscription_details: { subscription: sub } },
  })

  it("ignores invoices with amount_paid 0 — a 100%-off invoice is not a payment", () => {
    const out = firstPaidBySubscription([inv("sub_free", 0, 5_000), inv("sub_free", 0, 6_000), inv("sub_paid", 1, 7_000)])
    expect(out.has("sub_free")).toBe(false)
    expect(out.get("sub_paid")).toBe(7_000)
  })

  it("keeps the earliest paid_at per subscription, in any order", () => {
    const out = firstPaidBySubscription([inv("sub_1", 4_900, 9_000), inv("sub_1", 4_900, 3_000), inv("sub_1", 4_900, 6_000)])
    expect(out.get("sub_1")).toBe(3_000)
  })

  it("reads an expanded subscription, falls back to created, and skips invoices with no subscription", () => {
    const out = firstPaidBySubscription([
      inv({ id: "sub_x" }, 4_900, null, 2_000),
      inv(null, 4_900, 1_000),
      { amount_paid: 4_900, created: 1_000, parent: null },
    ])
    expect([...out]).toEqual([["sub_x", 2_000]])
  })
})

/* ------------------------------------------- the SDK against a local mock */

describe("loadFromStripe (official SDK → loopback mock, never real Stripe)", () => {
  const seen: { method: string; url: string; auth: string | undefined }[] = []
  let server: http.Server
  let port = 0

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization })
      const url = new URL(req.url!, "http://localhost")
      res.setHeader("Content-Type", "application/json")
      if (url.pathname === "/v1/subscriptions") {
        // Two pages, to prove pagination is followed.
        const after = url.searchParams.get("starting_after")
        const page = after
          ? [{ ...stripeSub("sub_2"), status: "canceled", ended_at: NOW_SEC - 86_400 }]
          : [stripeSub("sub_1")]
        res.end(JSON.stringify({ object: "list", url: "/v1/subscriptions", has_more: !after, data: page }))
        return
      }
      if (url.pathname === "/v1/invoices") {
        // Two pages too. sub_1 paid twice (the earlier one wins), once for
        // $0 (ignored); sub_2 only ever had a $0 invoice; sub_9 is not in
        // the subscription list at all.
        const after = url.searchParams.get("starting_after")
        const page = after
          ? [
              stripeInvoice("in_3", "sub_1", { amount_paid: 4_900, paid_at: NOW_SEC - 60 * 86_400 }),
              stripeInvoice("in_4", "sub_9", { amount_paid: 4_900, paid_at: NOW_SEC - 5 * 86_400 }),
            ]
          : [
              stripeInvoice("in_1", "sub_1", { amount_paid: 4_900, paid_at: NOW_SEC - 30 * 86_400 }),
              stripeInvoice("in_2", "sub_2", { amount_paid: 0, paid_at: NOW_SEC - 30 * 86_400 }),
              stripeInvoice("in_5", "sub_1", { amount_paid: 0, paid_at: NOW_SEC - 90 * 86_400 }),
            ]
        res.end(JSON.stringify({ object: "list", url: "/v1/invoices", has_more: !after, data: page }))
        return
      }
      if (url.pathname === "/v1/charges") {
        res.end(
          JSON.stringify({
            object: "list",
            url: "/v1/charges",
            has_more: false,
            data: [{ id: "ch_1", object: "charge", amount: 4_900, currency: "usd", status: "succeeded", captured: true, created: NOW_SEC - 60, billing_details: { email: "coach@example.com" } }],
          })
        )
        return
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: { type: "invalid_request_error" } }))
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it("makes only GET list calls with the key as a Bearer token, and keeps only what it needs", async () => {
    vi.useRealTimers()
    const config = readStripeConfig({ ...ENV, STRIPE_API_BASE: `http://127.0.0.1:${port}` })
    expect(config.kind).toBe("ok")
    const data = await loadFromStripe(config as Extract<typeof config, { kind: "ok" }>, NOW)

    expect(seen.every((r) => r.method === "GET")).toBe(true)
    expect(seen.every((r) => r.auth === `Bearer ${KEY}`)).toBe(true)
    const subCalls = seen.filter((r) => r.url.startsWith("/v1/subscriptions"))
    expect(subCalls).toHaveLength(2)
    expect(decodeURIComponent(subCalls[0].url)).toContain("status=all")
    expect(decodeURIComponent(subCalls[0].url)).toContain("expand[0]=data.discounts.source.coupon")
    const chargeCall = seen.find((r) => r.url.startsWith("/v1/charges"))!
    expect(decodeURIComponent(chargeCall.url)).toContain(`created[gte]=${NOW_SEC - 15 * 86_400}`)
    // Paid invoices are listed once (two pages), not looked up per subscription.
    const invoiceCalls = seen.filter((r) => r.url.startsWith("/v1/invoices"))
    expect(invoiceCalls).toHaveLength(2)
    expect(invoiceCalls[0].url).toContain("status=paid")
    expect(invoiceCalls[1].url).toContain("starting_after=in_5")
    expect(seen.filter((r) => /\/v1\/(subscriptions|invoices)\/./.test(r.url))).toEqual([])

    expect(data.subscriptions.map((s) => s.id)).toEqual(["sub_1", "sub_2"])
    // Joined on parent.subscription_details.subscription: the earliest paid
    // invoice with money on it; $0 invoices do not make a payer.
    expect(data.subscriptions.map((s) => s.first_paid_at)).toEqual([NOW_SEC - 60 * 86_400, null])
    expect(data.subscriptions[0].discounts).toEqual([
      { start: NOW_SEC - 10, end: null, source: { coupon: { amount_off: null, percent_off: 25, currency: null, duration: "forever" } } },
    ])
    expect(data.charges).toEqual([{ id: "ch_1", amount: 4_900, currency: "usd", status: "succeeded", captured: true, created: NOW_SEC - 60 }])
    // No customer details survive into the cache.
    expect(JSON.stringify(data)).not.toContain("coach@example.com")
  })
})

function stripeInvoice(id: string, subscription: string, { amount_paid, paid_at }: { amount_paid: number; paid_at: number }) {
  return {
    id,
    object: "invoice",
    status: "paid",
    amount_paid,
    currency: "usd",
    created: paid_at - 3_600,
    customer: "cus_123",
    customer_email: "coach@example.com",
    status_transitions: { finalized_at: paid_at - 3_600, paid_at, marked_uncollectible_at: null, voided_at: null },
    parent: { type: "subscription_details", quote_details: null, subscription_details: { metadata: {}, subscription } },
  }
}

function stripeSub(id: string) {
  return {
    id,
    object: "subscription",
    status: "active",
    currency: "usd",
    created: NOW_SEC - 90 * 86_400,
    start_date: NOW_SEC - 90 * 86_400,
    trial_start: null,
    trial_end: null,
    ended_at: null,
    canceled_at: null,
    cancellation_details: { reason: null, comment: null, feedback: null },
    customer: "cus_123",
    discounts: [
      { id: "di_1", object: "discount", start: NOW_SEC - 10, end: null, source: { type: "coupon", coupon: { id: "co_1", object: "coupon", amount_off: null, percent_off: 25, currency: null, duration: "forever" } } },
    ],
    items: {
      object: "list",
      has_more: false,
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          quantity: 1,
          discounts: [],
          price: { id: "price_1", object: "price", currency: "usd", unit_amount: 4_900, unit_amount_decimal: "4900", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } },
        },
      ],
    },
  }
}
