// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { createSubscriberLists } = await import("@/lib/server/stripe-subscribers")
import { pickSubscribers } from "@/lib/stripe-subscribers"
import type { StripeData, StripeSubscription } from "@/lib/stripe-metrics"

const NOW = new Date("2026-10-14T17:00:00.000Z")
const NOW_SEC = Math.floor(NOW.getTime() / 1000)
const DAY = 86_400
let n = 1
function sub(o: Partial<StripeSubscription> = {}): StripeSubscription {
  const start = o.start_date ?? NOW_SEC - 200 * DAY
  return {
    id: `sub_${n++}`,
    customer: `cus_${n}`,
    first_paid_at: start,
    status: "active",
    currency: "usd",
    created: start,
    start_date: start,
    trial_start: null,
    trial_end: null,
    ended_at: null,
    cancellation_details: null,
    items: { data: [{ price: { currency: "usd", unit_amount: 4_900, nickname: "Pro monthly", recurring: { interval: "month", interval_count: 1 } }, quantity: 1 }] },
    discounts: [],
    ...o,
  }
}

const joined = sub({ start_date: NOW_SEC - 3 * DAY })
const joinedEarlier = sub({ start_date: NOW_SEC - 10 * DAY, status: "canceled", ended_at: NOW_SEC - DAY })
const left = sub({ status: "canceled", ended_at: NOW_SEC - 2 * DAY, cancellation_details: { reason: "cancellation_requested" } })
const old = sub()
const pastDueJoiner = sub({ start_date: NOW_SEC - 4 * DAY, status: "past_due" })
const DATA: StripeData = { subscriptions: [old, joined, joinedEarlier, left, pastDueJoiner], charges: [] }

describe("pickSubscribers", () => {
  it("new: first paid inside the current window, active or since canceled, newest first", () => {
    const { total, picks, window } = pickSubscribers(DATA.subscriptions, "new", { now: NOW, timeZone: "America/Chicago" })
    expect(total).toBe(2)
    expect(picks.map((p) => p.subscriptionId)).toEqual([joined.id, joinedEarlier.id])
    expect(picks[0]).toMatchObject({ plan: "Pro monthly", interval: "month", mrr: 49, reason: null, customerId: joined.customer })
    expect(window.end).toBe(NOW.toISOString())
  })

  it("churned: the churn set, with the reason; total matches churn.churned", () => {
    const { total, picks } = pickSubscribers(DATA.subscriptions, "churned", { now: NOW, timeZone: "America/Chicago" })
    expect(total).toBe(1) // joinedEarlier was not active at the window's start
    expect(picks[0]).toMatchObject({ subscriptionId: left.id, reason: "cancellation_requested", mrr: 49 })
    expect(picks[0].at).toBe(new Date(left.ended_at! * 1000).toISOString())
  })

  it("returns at most 100 rows but the full total", () => {
    const many = Array.from({ length: 130 }, () => sub({ start_date: NOW_SEC - DAY }))
    const out = pickSubscribers(many, "new", { now: NOW, timeZone: "UTC" })
    expect(out.total).toBe(130)
    expect(out.picks).toHaveLength(100)
  })
})

function setup(status: "connected" | "stale" | "connecting" | "not_connected" = "connected") {
  let now = NOW.getTime()
  const snapshot = vi.fn(async () =>
    status === "connected" || status === "stale" ? { status, syncedAt: NOW.getTime(), data: DATA } : { status }
  )
  const lookup = vi.fn(async (id: string) => ({ name: `Coach ${id}`, email: `${id}@example.test` }))
  const log = vi.fn()
  const lists = createSubscriberLists({ service: { snapshot }, lookup, clock: () => now, log })
  return { lists, lookup, log, snapshot, tick: (ms: number) => (now += ms) }
}

describe("subscriber lists service", () => {
  it("adds the customer's name and email from the lookup, never the customer id", async () => {
    const { lists } = setup()
    const body = await lists.read("new", "America/Chicago")
    expect(body.status).toBe("connected")
    expect(body.rows[0]).toMatchObject({ customerName: `Coach ${joined.customer}`, customerEmail: `${joined.customer}@example.test` })
    expect(body.rows[0]).not.toHaveProperty("customerId")
  })

  it("caches a list for about 2 minutes, then rebuilds it", async () => {
    const { lists, lookup, tick } = setup()
    await lists.read("new", "America/Chicago")
    await lists.read("new", "America/Chicago")
    expect(lookup).toHaveBeenCalledTimes(2)
    tick(60_000)
    await lists.read("new", "America/Chicago")
    expect(lookup).toHaveBeenCalledTimes(2)
    tick(61_000)
    await lists.read("new", "America/Chicago")
    expect(lookup).toHaveBeenCalledTimes(4)
  })

  it("caches customers across lists for the same 2 minutes", async () => {
    const { lists, lookup } = setup()
    await lists.read("new", "America/Chicago")
    await lists.read("new", "UTC")
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("a failed lookup leaves the name and email null and logs a word, never PII or the message", async () => {
    const { lists, lookup, log } = setup()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    lookup.mockRejectedValue(Object.assign(new Error("No such customer: cus_2 coach@example.test"), { type: "StripeInvalidRequestError" }))
    const body = await lists.read("churned", "America/Chicago")
    expect(body.rows[0]).toMatchObject({ customerName: null, customerEmail: null })
    expect(log.mock.calls.flat()).toEqual(["StripeInvalidRequestError"])
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls])
    expect(logged).not.toMatch(/cus_|@|Coach|No such/)
    warn.mockRestore()
    error.mockRestore()
  })

  it("logs nothing at all on success", async () => {
    const { lists, log } = setup()
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
    await lists.read("new", "America/Chicago")
    await lists.read("churned", "America/Chicago")
    expect(log).not.toHaveBeenCalled()
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    spies.forEach((s) => s.mockRestore())
  })

  it.each(["connecting", "not_connected"] as const)("%s: an empty list, no lookups", async (status) => {
    const { lists, lookup } = setup(status)
    expect(await lists.read("new", "UTC")).toEqual({ status, lastSyncedAt: null, list: "new", window: null, total: 0, rows: [] })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("stale keeps the rows and says so", async () => {
    const { lists } = setup("stale")
    const body = await lists.read("churned", "UTC")
    expect(body.status).toBe("stale")
    expect(body.total).toBe(1)
  })
})

describe("paidInvoicesOf (the sync's slim invoice copy)", () => {
  it("keeps amount, currency and paid time only, dropping zero-amount invoices", async () => {
    const { paidInvoicesOf } = await import("@/lib/server/stripe")
    const out = paidInvoicesOf([
      { amount_paid: 4_900, currency: "usd", created: 10, status_transitions: { paid_at: 12 }, customer_email: "x@example.test" } as never,
      { amount_paid: 0, currency: "usd", created: 11 },
      { amount_paid: 100, currency: "usd", created: 13, status_transitions: null },
    ])
    expect(out).toEqual([
      { amount_paid: 4_900, currency: "usd", paid_at: 12 },
      { amount_paid: 100, currency: "usd", paid_at: 13 },
    ])
  })
})
