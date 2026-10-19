import { describe, expect, it, vi } from "vitest"

import { createMrrCashStore, nextPollMs, type MrrCashFetcher } from "@/hooks/use-stripe-mrr-cash"
import { CONNECTING_POLL_MS, SUMMARY_POLL_MS } from "@/hooks/use-stripe-summary"
import type { Timers } from "@/lib/subscriber-source"
import {
  MRR_CASH_CONNECTING,
  MRR_CASH_NOT_CONNECTED,
  type MrrCashSummary,
} from "@/lib/stripe-mrr-cash"

const LIVE: MrrCashSummary = {
  status: "connected",
  lastSyncedAt: "2026-10-14T17:00:00.000Z",
  mrr: { points: [{ month: "2026-10", value: 49, partial: true }] },
  cash: {
    since: "2026-10-12T05:00:00.000Z",
    value: 49,
    previous: 0,
    days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-1${2 + i}`, value: i < 3 ? 0 : null, previous: i < 3 ? 0 : null })),
  },
}

function fakeTimers() {
  const pending: { fn: () => void; ms: number }[] = []
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const t = { fn, ms }
      pending.push(t)
      return t
    },
    clearTimeout: (t) => {
      const i = pending.indexOf(t as (typeof pending)[number])
      if (i >= 0) pending.splice(i, 1)
    },
  }
  return { timers, pending }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe("createMrrCashStore", () => {
  it("polls every 5 s while connecting, then every 60 s once live", async () => {
    const answers = [MRR_CASH_CONNECTING, MRR_CASH_CONNECTING, LIVE]
    const fetcher = vi.fn<MrrCashFetcher>(async () => answers.shift()!)
    const { timers, pending } = fakeTimers()
    const store = createMrrCashStore("America/Chicago", { fetcher, timers })
    expect(store.getState()).toEqual({ phase: "loading" })

    const unsubscribe = store.subscribe(() => {})
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", summary: MRR_CASH_CONNECTING })
    expect(pending.map((p) => p.ms)).toEqual([CONNECTING_POLL_MS])

    pending.shift()!.fn()
    await flush()
    expect(pending.map((p) => p.ms)).toEqual([CONNECTING_POLL_MS])

    pending.shift()!.fn()
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", summary: LIVE })
    expect(pending.map((p) => p.ms)).toEqual([SUMMARY_POLL_MS])

    unsubscribe()
    expect(pending).toHaveLength(0)
  })

  it("our endpoint failing reads not connected with no figures, and stale with them", async () => {
    let fail = true
    const fetcher = vi.fn<MrrCashFetcher>(async () => {
      if (fail) throw new Error("500")
      return LIVE
    })
    const { timers, pending } = fakeTimers()
    const store = createMrrCashStore("America/Chicago", { fetcher, timers })
    store.subscribe(() => {})
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", summary: MRR_CASH_NOT_CONNECTED })

    fail = false
    pending.shift()!.fn()
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", summary: LIVE })

    fail = true
    pending.shift()!.fn()
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", summary: { ...LIVE, status: "stale" } })
  })

  it("paces like the Stripe summary: CONNECTING_POLL_MS while connecting, SUMMARY_POLL_MS otherwise", () => {
    expect(nextPollMs({ phase: "ready", summary: MRR_CASH_CONNECTING })).toBe(CONNECTING_POLL_MS)
    expect(nextPollMs({ phase: "ready", summary: LIVE })).toBe(SUMMARY_POLL_MS)
    expect(nextPollMs({ phase: "ready", summary: MRR_CASH_NOT_CONNECTED })).toBe(SUMMARY_POLL_MS)
    expect(nextPollMs({ phase: "loading" })).toBe(SUMMARY_POLL_MS)
  })
})
