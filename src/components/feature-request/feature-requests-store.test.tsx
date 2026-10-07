import * as React from "react"
import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildSeed } from "@/lib/feature-requests/fixture"
import {
  FeatureRequestsProvider,
  STORAGE_KEY,
  initialState,
  isRequest,
  isState,
  loadState,
  reducer,
  saveState,
  useFeatureRequests,
} from "@/components/feature-request/feature-requests-store"

const TODAY = new Date("2026-08-24T15:00:00.000Z")
const AT = "2026-08-24T16:00:00.000Z"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

describe("reducer", () => {
  it("adds an idea to the top of the Inbox, from Dan by default, not sample data", () => {
    const state = reducer(initialState(), {
      type: "add",
      input: { title: "  Practice plan templates ", ask: " Reusable weekly plans. " },
      at: AT,
    })
    expect(state.requests).toHaveLength(11)
    const [added] = state.requests
    expect(added).toMatchObject({
      id: "fr-11",
      title: "Practice plan templates",
      ask: "Reusable weekly plans.",
      from: "Dan",
      status: "inbox",
      createdAt: AT,
      updatedAt: AT,
    })
    expect(added.sample).toBeUndefined()
    expect(state.nextId).toBe(12)
  })

  it("keeps a custom sender and refuses an empty title", () => {
    let state = reducer(initialState(), {
      type: "add",
      input: { title: "From a coach", from: "Coach Kim" },
      at: AT,
    })
    expect(state.requests[0].from).toBe("Coach Kim")
    const before = state
    state = reducer(state, { type: "add", input: { title: "   " }, at: AT })
    expect(state).toBe(before)
  })

  it("edits title, ask and sender, and the edit drops the sample tag", () => {
    const state = reducer(initialState(), {
      type: "patch",
      id: "fr-1",
      patch: { title: "Play of the Day (pinned)", ask: "Pin one play.", from: "Dan + Rashad" },
      at: AT,
    })
    const r = state.requests.find((x) => x.id === "fr-1")!
    expect(r.title).toBe("Play of the Day (pinned)")
    expect(r.ask).toBe("Pin one play.")
    expect(r.from).toBe("Dan + Rashad")
    expect(r.updatedAt).toBe(AT)
    expect(r.sample).toBeUndefined()
  })

  it("keeps the sample tag when the words are unchanged", () => {
    const seed = initialState().requests[0]
    const state = reducer(initialState(), {
      type: "patch",
      id: "fr-1",
      patch: { title: seed.title, ask: seed.ask, from: "Dan" },
      at: AT,
    })
    expect(state.requests[0].sample).toBe(true)
  })

  it("never blanks a title through a patch", () => {
    const state = reducer(initialState(), {
      type: "patch",
      id: "fr-1",
      patch: { title: "  " },
      at: AT,
    })
    expect(state.requests[0].title).toBe("Play of the Day")
  })

  it("moves a card between columns and stamps updatedAt", () => {
    let state = reducer(initialState(), {
      type: "set-status",
      id: "fr-1",
      status: "roadmap",
      at: AT,
    })
    expect(state.requests[0].status).toBe("roadmap")
    expect(state.requests[0].updatedAt).toBe(AT)
    expect(state.requests[0].sample).toBe(true) // moving is not rewriting
    const same = state
    state = reducer(state, { type: "set-status", id: "fr-1", status: "roadmap", at: "later" })
    expect(state.requests[0]).toBe(same.requests[0])
  })

  it("removes a card", () => {
    const state = reducer(initialState(), { type: "remove", id: "fr-5" })
    expect(state.requests).toHaveLength(9)
    expect(state.requests.some((r) => r.id === "fr-5")).toBe(false)
  })

  it("reset restores the seed, rebuilt against the time of the reset", () => {
    let state = reducer(initialState(), { type: "remove", id: "fr-1" })
    state = reducer(state, { type: "add", input: { title: "Mine" }, at: AT })
    const later = "2026-09-01T15:00:00.000Z"
    state = reducer(state, { type: "reset", at: later })
    expect(state.requests).toEqual(buildSeed(new Date(later)))
    expect(state.requests[0].createdAt).toBe(later)
    expect(state.nextId).toBe(11)
  })
})

describe("localStorage round trip", () => {
  it("saves and loads the same state", () => {
    const state = reducer(initialState(), {
      type: "add",
      input: { title: "Round trip" },
      at: AT,
    })
    saveState(window.localStorage, state)
    expect(loadState(window.localStorage)).toEqual(state)
  })

  it("ignores garbage and wrong shapes", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [] }))
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: {}, nextId: 1 }))
    expect(loadState(window.localStorage)).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ requests: [], nextId: 0 }))
    expect(loadState(window.localStorage)).toBeNull()
  })

  it("refuses the whole copy when any one item is bad", () => {
    const corruptions: Array<[string, Record<string, unknown>]> = [
      ["unknown status", { status: "done" }],
      ["empty title", { title: "  " }],
      ["missing title", { title: undefined }],
      ["empty sender", { from: "" }],
      ["unparseable createdAt", { createdAt: "yesterday-ish" }],
      ["non-string updatedAt", { updatedAt: 42 }],
      ["ask not a string", { ask: null }],
      ["sample not a boolean true", { sample: "yes" }],
      ["empty id", { id: "" }],
    ]
    for (const [label, patch] of corruptions) {
      const good = initialState()
      const bad = { ...good, requests: good.requests.map((r, i) => (i === 4 ? { ...r, ...patch } : r)) }
      expect(isRequest(bad.requests[4]), label).toBe(false)
      expect(isState(bad), label).toBe(false)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))
      expect(loadState(window.localStorage), label).toBeNull()
    }
  })

  it("refuses duplicate ids", () => {
    const good = initialState()
    const bad = { ...good, requests: [...good.requests, { ...good.requests[0] }] }
    expect(isState(bad)).toBe(false)
  })

  it("accepts a sound copy, with or without the sample flag", () => {
    const good = reducer(initialState(), { type: "add", input: { title: "Mine" }, at: AT })
    expect(isState(good)).toBe(true)
    expect(isState(JSON.parse(JSON.stringify(good)))).toBe(true)
  })

  it("uses the agreed key", () => {
    expect(STORAGE_KEY).toBe("hotdash.feature-requests.v1")
  })
})

function Probe() {
  const { requests, persisted, saved, addRequest, setStatus, resetDemoData } =
    useFeatureRequests()
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="saved">{String(saved)}</span>
      <button type="button" onClick={() => addRequest({ title: "   " })}>
        add-nothing
      </button>
      <button type="button" onClick={() => setStatus("fr-2", "inbox")}>
        same-status
      </button>
      <span data-testid="count">{requests.length}</span>
      <span data-testid="first">{requests[0]?.title ?? ""}</span>
      <span data-testid="first-date">{requests[0]?.createdAt ?? ""}</span>
      <span data-testid="fr-2-status">
        {requests.find((r) => r.id === "fr-2")?.status ?? ""}
      </span>
      <button type="button" onClick={() => addRequest({ title: "Probe idea" })}>
        add
      </button>
      <button type="button" onClick={() => setStatus("fr-2", "parked")}>
        park
      </button>
      <button type="button" onClick={resetDemoData}>
        reset
      </button>
    </div>
  )
}

describe("FeatureRequestsProvider persistence", () => {
  it("hydrates before the first paint, so there is no seed flash to see", () => {
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    // Synchronous: the layout effect ran inside render(), no await needed.
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("10")
  })

  it("does not write the untouched seed to localStorage on first load", () => {
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

    // No-op "edits" do not count either.
    act(() => screen.getByRole("button", { name: "add-nothing" }).click())
    act(() => screen.getByRole("button", { name: "same-status" }).click())
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("so the seed is dated from whichever day the page is opened", () => {
    const first = render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    first.unmount()
    vi.setSystemTime(new Date("2026-09-10T15:00:00.000Z"))
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    expect(screen.getByTestId("first-date")).toHaveTextContent("2026-09-10T15:00:00.000Z")
  })

  it("persists from the first real edit on, and rehydrates after a remount (reload)", () => {
    const first = render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    act(() => screen.getByRole("button", { name: "park" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("11")
    expect(screen.getByTestId("first")).toHaveTextContent("Probe idea")
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("parked")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"title":"Probe idea"')

    first.unmount()
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("11")
    expect(screen.getByTestId("first")).toHaveTextContent("Probe idea")
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("parked")
  })

  it("Reset throws the browser's copy away entirely and shows a fresh seed", () => {
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("10")
    expect(screen.getByTestId("first")).toHaveTextContent("Play of the Day")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("falls back to the seed when nothing is saved", () => {
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    expect(screen.getByTestId("count")).toHaveTextContent("10")
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("inbox")
  })

  it("falls back to the seed when the saved copy has one bad item, and keeps the bad copy out of the way", () => {
    const bad = reducer(initialState(), { type: "add", input: { title: "Mine" }, at: AT })
    bad.requests[3] = { ...bad.requests[3], status: "shipped" as never }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))
    render(
      <FeatureRequestsProvider>
        <Probe />
      </FeatureRequestsProvider>
    )
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("count")).toHaveTextContent("10")
    expect(screen.getByTestId("first")).toHaveTextContent("Play of the Day")
    // Nothing is written until the founder edits again; the next edit replaces the bad copy.
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("shipped")
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("shipped")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe idea")
  })
})
