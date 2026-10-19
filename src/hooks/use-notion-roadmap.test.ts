import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CONNECTING_POLL_MS,
  NOTION_LOADING_VIEW,
  ROADMAP_POLL_MS,
  createRoadmapStore,
  fetchRoadmap,
  roadmapReducer,
  type RoadmapFetcher,
} from "@/hooks/use-notion-roadmap"
import { NOTION_CONNECTING, NOTION_NOT_CONNECTED, notionFeedOf, type NotionRoadmapSummary } from "@/lib/notion-roadmap"
import { RETRY_MS } from "@/lib/subscriber-source"
import { LIVE_ROADMAP, liveRoadmapSummary } from "@/test/notion"

describe("roadmapReducer", () => {
  it("an answer replaces whatever was there", () => {
    expect(roadmapReducer(NOTION_LOADING_VIEW, { type: "summary", summary: liveRoadmapSummary() })).toEqual({
      phase: "ready",
      summary: liveRoadmapSummary(),
    })
  })

  it("our endpoint failing keeps the last rows, marked stale", () => {
    const view = roadmapReducer({ phase: "ready", summary: liveRoadmapSummary() }, { type: "failure" })
    expect(view).toEqual({ phase: "ready", summary: liveRoadmapSummary("stale") })
  })

  it("failing before any rows reads as not connected, never an empty roadmap", () => {
    expect(roadmapReducer(NOTION_LOADING_VIEW, { type: "failure" })).toEqual({ phase: "ready", summary: NOTION_NOT_CONNECTED })
  })

  it("connecting was the server's word: our endpoint failing then reads as not connected", () => {
    expect(roadmapReducer({ phase: "ready", summary: NOTION_CONNECTING }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: NOTION_NOT_CONNECTED,
    })
  })
})

describe("notionFeedOf", () => {
  it("loading, connecting, not connected, live and stale", () => {
    expect(notionFeedOf(NOTION_LOADING_VIEW)).toEqual({ kind: "loading" })
    expect(notionFeedOf({ phase: "ready", summary: NOTION_CONNECTING })).toEqual({ kind: "loading", connecting: true })
    expect(notionFeedOf({ phase: "ready", summary: NOTION_NOT_CONNECTED })).toEqual({ kind: "not_connected" })
    expect(notionFeedOf({ phase: "ready", summary: liveRoadmapSummary("stale") })).toMatchObject({
      kind: "live",
      stale: true,
      roadmap: LIVE_ROADMAP,
    })
  })
})

describe("createRoadmapStore", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("reads on first listener, then every minute; stops when nobody listens", async () => {
    const fetcher = vi.fn<RoadmapFetcher>(async () => liveRoadmapSummary())
    const store = createRoadmapStore({ fetcher })
    expect(store.getState()).toBe(NOTION_LOADING_VIEW)
    const stop = store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: liveRoadmapSummary() })
    await vi.advanceTimersByTimeAsync(ROADMAP_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    stop()
    await vi.advanceTimersByTimeAsync(ROADMAP_POLL_MS * 5)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("polls every CONNECTING_POLL_MS while the server is connecting, then every minute", async () => {
    let answer: NotionRoadmapSummary = NOTION_CONNECTING
    const fetcher = vi.fn<RoadmapFetcher>(async () => answer)
    const store = createRoadmapStore({ fetcher })
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: NOTION_CONNECTING })
    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(2)
    answer = liveRoadmapSummary()
    await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(store.getState()).toEqual({ phase: "ready", summary: liveRoadmapSummary() })
    await vi.advanceTimersByTimeAsync(ROADMAP_POLL_MS - 1)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it("backs off after failures, and recovers", async () => {
    let fail = true
    const fetcher = vi.fn<RoadmapFetcher>(async () => {
      if (fail) throw new Error("offline")
      return liveRoadmapSummary()
    })
    const store = createRoadmapStore({ fetcher })
    store.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState()).toEqual({ phase: "ready", summary: NOTION_NOT_CONNECTED })
    fail = false
    await vi.advanceTimersByTimeAsync(RETRY_MS[0])
    expect(store.getState()).toEqual({ phase: "ready", summary: liveRoadmapSummary() })
  })
})

describe("fetchRoadmap", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads our endpoint, never cached, and refuses an unreadable or failed answer", async () => {
    const fetch = vi.fn(async () => Response.json(liveRoadmapSummary()))
    vi.stubGlobal("fetch", fetch)
    expect(await fetchRoadmap()).toEqual(liveRoadmapSummary())
    expect(fetch).toHaveBeenCalledWith("/api/notion/roadmap", { cache: "no-store" })

    fetch.mockResolvedValueOnce(Response.json({ status: "connected" }))
    await expect(fetchRoadmap()).rejects.toThrow()
    fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }))
    await expect(fetchRoadmap()).rejects.toThrow()
  })
})
