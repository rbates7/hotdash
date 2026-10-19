import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WORKBOARD_CONNECTING_POLL_MS,
  WORKBOARD_POLL_MS,
  createWorkboardStore,
  fetchWorkboard,
  type WorkboardFetcher,
} from "@/hooks/use-workboard"
import type { WorkboardResponse } from "@/lib/workboard"
import { WORKBOARD_LOADING_VIEW, WORKBOARD_NOT_CONNECTED } from "@/lib/workboard-view"
import { RETRY_MS } from "@/lib/subscriber-source"
import { workboardSummary } from "@/test/workboard-fixture"

describe("createWorkboardStore", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reads on first listener, then every minute; stops when nobody listens", async () => {
    const fetcher = vi.fn<WorkboardFetcher>(async () => workboardSummary("connected"))
    const store = createWorkboardStore({ fetcher })
    expect(store.getState()).toBe(WORKBOARD_LOADING_VIEW)
    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: workboardSummary("connected") })
    await vi.advanceTimersByTimeAsync(WORKBOARD_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(WORKBOARD_POLL_MS * 5)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("polls quickly while the server is connecting, then every minute", async () => {
    let answer: WorkboardResponse = workboardSummary("connecting")
    const fetcher = vi.fn<WorkboardFetcher>(async () => answer)
    const store = createWorkboardStore({ fetcher })
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: workboardSummary("connecting") })
    answer = workboardSummary("connected")
    await vi.advanceTimersByTimeAsync(WORKBOARD_CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(store.getState()).toEqual({ phase: "ready", summary: workboardSummary("connected") })
    await vi.advanceTimersByTimeAsync(WORKBOARD_CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("a failed first read is not connected; later failures keep rows as stale and back off", async () => {
    let fail = true
    const fetcher = vi.fn<WorkboardFetcher>(async () => {
      if (fail) throw new Error("down")
      return workboardSummary("connected")
    })
    const store = createWorkboardStore({ fetcher })
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: WORKBOARD_NOT_CONNECTED })
    fail = false
    await vi.advanceTimersByTimeAsync(RETRY_MS[0])
    expect(store.getState()).toEqual({ phase: "ready", summary: workboardSummary("connected") })
    fail = true
    await vi.advanceTimersByTimeAsync(WORKBOARD_POLL_MS)
    expect(store.getState()).toEqual({ phase: "ready", summary: workboardSummary("stale") })
  })
})

describe("fetchWorkboard", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads /api/workboard with no-store and parses the body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(workboardSummary("connected"))))
    vi.stubGlobal("fetch", fetchMock)
    await expect(fetchWorkboard()).resolves.toEqual(workboardSummary("connected"))
    expect(fetchMock).toHaveBeenCalledWith("/api/workboard", { cache: "no-store" })
  })

  it("throws on a non-2xx or an unreadable body (the store turns that into not connected / stale)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })))
    await expect(fetchWorkboard()).rejects.toThrow("workboard 404")
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hello: "world" }))))
    await expect(fetchWorkboard()).rejects.toThrow("workboard unreadable")
  })
})
