import { describe, expect, it, vi } from "vitest"

import { createInboxStore, type InboxFetcher } from "@/hooks/use-inbox"
import { INBOX_CONNECTING_POLL_MS, INBOX_POLL_MS, type InboxResponse } from "@/lib/inbox-sources"
import type { Timers } from "@/lib/subscriber-source"

const NOW = new Date("2026-10-18T20:00:00.000Z")
const at = NOW.toISOString()

const inbox = (sentry: "connecting" | "connected"): InboxResponse => ({
  fetchedAt: at,
  sources: {
    github: { status: "connected", fetchedAt: at },
    sentry: { status: sentry, fetchedAt: sentry === "connected" ? at : null },
    gmail: { status: "not_connected", fetchedAt: null },
  },
  items: [],
})

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

describe("createInboxStore", () => {
  it("is loading, then polls every 5 s while a source connects and every 60 s after", async () => {
    const answers = [inbox("connecting"), inbox("connected")]
    const fetcher = vi.fn<InboxFetcher>(async () => answers.shift()!)
    const { timers, pending } = fakeTimers()
    const store = createInboxStore({ fetcher, timers, now: () => NOW })
    expect(store.getState()).toEqual({ phase: "loading" })
    const off = store.subscribe(() => {})
    await flush()
    expect(pending.map((p) => p.ms)).toEqual([INBOX_CONNECTING_POLL_MS])
    pending.shift()!.fn()
    await flush()
    expect(store.getState()).toEqual({ phase: "ready", inbox: inbox("connected") })
    expect(pending.map((p) => p.ms)).toEqual([INBOX_POLL_MS])
    off()
    expect(pending).toHaveLength(0)
  })

  it("an unreachable endpoint with nothing yet is every source not connected, no rows", async () => {
    const store = createInboxStore({ fetcher: async () => Promise.reject(new Error("500")), timers: fakeTimers().timers, now: () => NOW })
    store.subscribe(() => {})
    await flush()
    const state = store.getState()
    if (state.phase !== "ready") throw new Error("ready")
    expect(state.inbox.items).toEqual([])
    expect(Object.values(state.inbox.sources).map((s) => s.status)).toEqual(["not_connected", "not_connected", "not_connected"])
  })
})
