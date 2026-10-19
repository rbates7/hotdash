// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RETRY_AFTER_MS, createStripeService, type Loader } from "@/lib/server/stripe"
import type { StripeData } from "@/lib/stripe-metrics"
import { MRR_CASH_CONNECTING, MRR_CASH_NOT_CONNECTED } from "@/lib/stripe-mrr-cash"

/** Fake key: shaped like Stripe's, valid nowhere. */
const ENV = { STRIPE_READONLY_KEY: "rk_test_hotdashUnitTestOnly000", NODE_ENV: "test" }
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

function deferred() {
  let resolve!: (d: StripeData) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<StripeData>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("stripeService.mrrCash", () => {
  it("is not connected with no key, and never calls Stripe", async () => {
    const load = vi.fn<Loader>()
    const svc = createStripeService({ env: () => ({}), load, log: vi.fn() })
    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_NOT_CONNECTED)
    expect(load).not.toHaveBeenCalled()
  })

  it("is connecting while the first sync runs, then the figures from the same copy", async () => {
    const first = deferred()
    const load = vi.fn<Loader>(() => first.promise)
    const svc = createStripeService({ env: () => ENV, load, log: vi.fn() })

    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_CONNECTING)
    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_CONNECTING)
    // The summary and the chart share one sync.
    await svc.summary("America/Chicago")
    expect(load).toHaveBeenCalledTimes(1)

    first.resolve(DATA)
    await svc.settled()
    const live = await svc.mrrCash("America/Chicago")
    expect(live).toMatchObject({ status: "connected", lastSyncedAt: NOW.toISOString() })
    if (live.status !== "connected") throw new Error("expected connected")
    expect(live.mrr.points).toHaveLength(12)
    expect(live.mrr.points.at(-1)).toEqual({ month: "2026-10", value: 49, partial: true })
    expect(live.cash.value).toBe(49)
    const summary = await svc.summary("America/Chicago")
    expect(summary.metrics?.cashThisWeek.value).toBe(live.cash.value)
    expect(summary.metrics?.mrr.value).toBe(live.mrr.points.at(-1)!.value)
  })

  it("a failed first sync is not connected, not connecting forever", async () => {
    const log = vi.fn()
    const load = vi.fn<Loader>(() => Promise.reject(Object.assign(new Error("rk_test_secret"), { type: "StripeAuthenticationError" })))
    const svc = createStripeService({ env: () => ENV, load, log })
    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_CONNECTING)
    await svc.settled()
    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_NOT_CONNECTED)
    expect(log).toHaveBeenCalledWith("StripeAuthenticationError")
    // Even once the retry is running.
    vi.advanceTimersByTime(RETRY_AFTER_MS)
    expect(await svc.mrrCash("America/Chicago")).toEqual(MRR_CASH_NOT_CONNECTED)
  })

  it("keeps the last good figures as stale after a failed refresh", async () => {
    let fail = false
    const load = vi.fn<Loader>(() => (fail ? Promise.reject(new Error("down")) : Promise.resolve(DATA)))
    const svc = createStripeService({ env: () => ENV, load, log: vi.fn(), ttlMs: 1_000 })
    await svc.mrrCash("America/Chicago")
    await svc.settled()
    fail = true
    vi.advanceTimersByTime(1_000)
    await svc.mrrCash("America/Chicago")
    await svc.settled()
    expect(await svc.mrrCash("America/Chicago")).toMatchObject({ status: "stale", lastSyncedAt: NOW.toISOString() })
  })

  it("computes per zone, from the sync instant", async () => {
    const load = vi.fn<Loader>(() => Promise.resolve(DATA))
    const svc = createStripeService({ env: () => ENV, load, log: vi.fn() })
    await svc.mrrCash("UTC")
    await svc.settled()
    vi.advanceTimersByTime(30_000)
    const ct = await svc.mrrCash("America/Chicago")
    const utc = await svc.mrrCash("UTC")
    if (ct.status !== "connected" || utc.status !== "connected") throw new Error("expected connected")
    expect(ct.cash.since).toBe("2026-10-12T05:00:00.000Z")
    expect(utc.cash.since).toBe("2026-10-12T00:00:00.000Z")
  })

  it("reset forgets the copy", async () => {
    const svc = createStripeService({ env: () => ENV, load: () => Promise.resolve(DATA), log: vi.fn() })
    await svc.mrrCash("UTC")
    await svc.settled()
    svc.reset()
    expect(await svc.mrrCash("UTC")).toEqual(MRR_CASH_CONNECTING)
  })
})
