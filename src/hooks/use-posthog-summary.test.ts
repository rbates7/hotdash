import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  POSTHOG_LOADING_VIEW,
  POSTHOG_POLL_MS,
  createPosthogStore,
  fetchPosthogSummary,
  posthogReducer,
  type PosthogFetcher,
} from "@/hooks/use-posthog-summary"
import { RETRY_MS } from "@/lib/subscriber-source"
import { POSTHOG_NOT_CONNECTED } from "@/lib/posthog-summary"
import { livePosthogSummary } from "@/test/posthog-fixture"

describe("posthogReducer", () => {
  it("an answer replaces whatever was there", () => {
    expect(posthogReducer(POSTHOG_LOADING_VIEW, { type: "summary", summary: livePosthogSummary("connected") })).toEqual({
      phase: "ready",
      summary: livePosthogSummary("connected"),
    })
  })

  it("our endpoint failing keeps the last figures, marked stale", () => {
    const view = posthogReducer({ phase: "ready", summary: livePosthogSummary("connected") }, { type: "failure" })
    expect(view).toEqual({ phase: "ready", summary: livePosthogSummary("stale") })
  })

  it("failing before any figures reads as not connected, never zeros", () => {
    expect(posthogReducer(POSTHOG_LOADING_VIEW, { type: "failure" })).toEqual({ phase: "ready", summary: POSTHOG_NOT_CONNECTED })
  })
})

describe("createPosthogStore", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reads on first listener, then every minute; stops when nobody listens", async () => {
    const fetcher = vi.fn<PosthogFetcher>(async () => livePosthogSummary("connected"))
    const store = createPosthogStore({ fetcher })
    expect(store.getState()).toBe(POSTHOG_LOADING_VIEW)
    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: livePosthogSummary("connected") })
    await vi.advanceTimersByTimeAsync(POSTHOG_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(POSTHOG_POLL_MS * 5)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("backs off after failures, and recovers", async () => {
    let fail = true
    const fetcher = vi.fn<PosthogFetcher>(async () => {
      if (fail) throw new Error("offline")
      return livePosthogSummary("connected")
    })
    const store = createPosthogStore({ fetcher })
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: POSTHOG_NOT_CONNECTED })
    await vi.advanceTimersByTimeAsync(RETRY_MS[0] - 1)
    expect(fetcher).toHaveBeenCalledTimes(1)
    fail = false
    await vi.advanceTimersByTimeAsync(1)
    expect(store.getState()).toEqual({ phase: "ready", summary: livePosthogSummary("connected") })
  })
})

describe("fetchPosthogSummary", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads /api/posthog/summary, and rejects an error status or an unreadable body", async () => {
    const fetchMock = vi.fn(async () => Response.json(livePosthogSummary("connected")))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchPosthogSummary()).toEqual(livePosthogSummary("connected"))
    expect(fetchMock).toHaveBeenCalledWith("/api/posthog/summary", { cache: "no-store" })

    vi.stubGlobal("fetch", async () => new Response("oops", { status: 500 }))
    await expect(fetchPosthogSummary()).rejects.toThrow()
    vi.stubGlobal("fetch", async () => Response.json({ status: "connected" }))
    await expect(fetchPosthogSummary()).rejects.toThrow()
  })
})
