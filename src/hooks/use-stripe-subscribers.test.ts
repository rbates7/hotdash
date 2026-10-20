import { describe, expect, it, vi } from "vitest"

import { createSubscriberListStore } from "@/hooks/use-stripe-subscribers"
import { subscriberList } from "@/test/stripe-fixture"

const timers = () => {
  const pending: (() => void)[] = []
  return { pending, t: { setTimeout: (fn: () => void) => (pending.push(fn), pending.length), clearTimeout: () => {} } }
}

describe("subscriber list store", () => {
  it("a 401 is session expired and stops polling", async () => {
    const { pending, t } = timers()
    const fetcher = vi.fn(async () => ({ kind: "unauthorized" as const }))
    const store = createSubscriberListStore("new", "America/Chicago", { fetcher, timers: t })
    store.subscribe(() => {})
    await vi.waitFor(() => expect(store.getState()).toEqual({ phase: "unauthorized" }))
    expect(pending).toHaveLength(0)
  })
  it("reads its list and keeps polling", async () => {
    const { pending, t } = timers()
    const fetcher = vi.fn(async () => ({ kind: "ok" as const, data: subscriberList("churned") }))
    const store = createSubscriberListStore("churned", "America/Chicago", { fetcher, timers: t })
    store.subscribe(() => {})
    await vi.waitFor(() => expect(store.getState()).toMatchObject({ phase: "ready" }))
    expect(fetcher).toHaveBeenCalledWith("churned", "America/Chicago")
    expect(pending).toHaveLength(1)
  })
})
