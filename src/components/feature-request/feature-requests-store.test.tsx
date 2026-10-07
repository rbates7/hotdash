import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => vi.restoreAllMocks())

import { buildSeed } from "@/lib/feature-requests/fixture"
import { fireStorageEvent } from "@/test/storage"
import {
  FeatureRequestsProvider,
  REJECTED_KEY,
  STORAGE_KEY,
  featureRequestsStorage as storage,
  initialState,
  isRequest,
  isState,
  reducer,
  parseState,
  sanitize,
  useFeatureRequests,
} from "@/components/feature-request/feature-requests-store"

// Thin wrappers over the shared storage so the assertions below read plainly.
const loadState = (s: Storage) => storage.load(s).state
const rejectedRaw = (s: Storage) => storage.rejected(s).map((c) => c.raw)
const saveState = (s: Storage | undefined, state: Parameters<typeof storage.save>[1]) =>
  storage.save(s, state)
const clearState = (s: Storage) => storage.clear(s)

const TODAY = new Date("2026-08-24T15:00:00.000Z")
const NOW_MS = TODAY.getTime()
const AT = "2026-08-24T16:00:00.000Z"

const seed = () => initialState(TODAY)

describe("reducer", () => {
  it("adds an idea to the top of the Inbox, from Dan by default, not sample data", () => {
    const state = reducer(seed(), {
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
    let state = reducer(seed(), {
      type: "add",
      input: { title: "From a coach", from: "Coach Kim" },
      at: AT,
    })
    expect(state.requests[0].from).toBe("Coach Kim")
    const before = state
    state = reducer(state, { type: "add", input: { title: "   " }, at: AT })
    expect(state).toBe(before)
  })

  it("clamps title, ask and sender to their limits", () => {
    const state = reducer(seed(), {
      type: "add",
      input: { title: "t".repeat(500), ask: "a".repeat(500), from: "f".repeat(500) },
      at: AT,
    })
    expect(state.requests[0].title).toHaveLength(120)
    expect(state.requests[0].ask).toHaveLength(280)
    expect(state.requests[0].from).toHaveLength(40)
  })

  it("edits title, ask and sender, and the edit drops the sample tag", () => {
    const state = reducer(seed(), {
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

  it("a sender-only edit keeps the sample tag; the words are still ours", () => {
    const state = reducer(seed(), {
      type: "patch",
      id: "fr-1",
      patch: { from: "Dan + Rashad" },
      at: AT,
    })
    expect(state.requests[0].sample).toBe(true)
    expect(state.requests[0].updatedAt).toBe(AT)
  })

  it("a no-op patch returns the same state: no updatedAt bump, nothing to write", () => {
    const before = seed()
    const first = before.requests[0]
    const same = reducer(before, {
      type: "patch",
      id: "fr-1",
      patch: { title: `  ${first.title} `, ask: first.ask, from: "Dan" },
      at: AT,
    })
    expect(same).toBe(before)
    expect(same.requests[0].updatedAt).toBe(first.updatedAt)
    expect(reducer(before, { type: "patch", id: "fr-404", patch: { title: "x" }, at: AT })).toBe(before)
  })

  it("never blanks a title through a patch", () => {
    const state = reducer(seed(), {
      type: "patch",
      id: "fr-1",
      patch: { title: "  ", ask: "changed" },
      at: AT,
    })
    expect(state.requests[0].title).toBe("Play of the Day")
    expect(state.requests[0].ask).toBe("changed")
  })

  it("moves a card between columns and stamps updatedAt", () => {
    let state = reducer(seed(), { type: "set-status", id: "fr-1", status: "roadmap", at: AT })
    expect(state.requests[0].status).toBe("roadmap")
    expect(state.requests[0].updatedAt).toBe(AT)
    expect(state.requests[0].sample).toBe(true) // moving is not rewriting
    const same = state
    state = reducer(state, { type: "set-status", id: "fr-1", status: "roadmap", at: "later" })
    expect(state).toBe(same)
  })

  it("removes a card, and removing nothing is a no-op", () => {
    const before = seed()
    const state = reducer(before, { type: "remove", id: "fr-5" })
    expect(state.requests).toHaveLength(9)
    expect(state.requests.some((r) => r.id === "fr-5")).toBe(false)
    expect(reducer(before, { type: "remove", id: "fr-999" })).toBe(before)
  })

  it("reset restores the seed, dated from the instant it is given", () => {
    let state = reducer(seed(), { type: "remove", id: "fr-1" })
    state = reducer(state, { type: "add", input: { title: "Mine" }, at: AT })
    const later = "2026-09-01T15:00:00.000Z"
    state = reducer(state, { type: "reset", at: later })
    expect(state.requests).toEqual(buildSeed(new Date(later)))
    expect(state.requests[0].createdAt).toBe(later)
    expect(state.nextId).toBe(11)
  })
})

describe("localStorage", () => {
  it("uses the agreed keys", () => {
    expect(STORAGE_KEY).toBe("hotdash.feature-requests.v1")
    expect(REJECTED_KEY).toBe("hotdash.feature-requests.v1.rejected")
  })

  it("saves and loads the same state, reporting success", () => {
    const state = reducer(seed(), { type: "add", input: { title: "Round trip" }, at: AT })
    expect(saveState(window.localStorage, state)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(state)
    clearState(window.localStorage)
    expect(loadState(window.localStorage)).toBeNull()
  })

  it("reports a failed write instead of throwing (quota, private mode)", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    expect(saveState(window.localStorage, seed())).toBe(false)
    expect(saveState(undefined, seed())).toBe(false)
    setItem.mockRestore()
  })

  it("parseState validates then strips unknown keys", () => {
    expect(parseState({ requests: [], nextId: 1, extra: true })).toEqual({ requests: [], nextId: 1 })
    expect(parseState({ requests: [], nextId: 0 })).toBeNull()
  })

  it("strips unknown keys from a loaded copy", () => {
    const state = reducer(seed(), { type: "add", input: { title: "Mine" }, at: AT })
    const padded = {
      ...state,
      extra: 1,
      requests: state.requests.map((r) => ({ ...r, votes: 3, sample: r.sample })),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(padded))
    const loaded = loadState(window.localStorage)!
    expect(loaded).toEqual(state)
    expect("extra" in loaded).toBe(false)
    expect("votes" in loaded.requests[0]).toBe(false)
    expect(Object.keys(loaded.requests[1]).sort()).toEqual(
      ["ask", "createdAt", "from", "id", "sample", "status", "title", "updatedAt"]
    )
  })

  it("refuses garbage, wrong shapes and bad envelopes", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ requests: [] }),
      JSON.stringify({ requests: {}, nextId: 1 }),
      JSON.stringify({ requests: [], nextId: 1.5 }),
      JSON.stringify({ requests: [], nextId: "11" }),
    ]) {
      window.localStorage.setItem(STORAGE_KEY, raw)
      expect(loadState(window.localStorage), raw).toBeNull()
    }
  })

  it("refuses the whole copy when any one item is bad", () => {
    const corruptions: Array<[string, Record<string, unknown>]> = [
      ["unknown status", { status: "done" }],
      ["empty title", { title: "  " }],
      ["missing title", { title: undefined }],
      ["empty sender", { from: "" }],
      ["unparseable createdAt", { createdAt: "yesterday-ish" }],
      ["createdAt that parses but is not ISO", { createdAt: "0" }],
      ["createdAt without milliseconds", { createdAt: "2026-08-24T15:00:00Z" }],
      ["non-string updatedAt", { updatedAt: 42 }],
      ["ask not a string", { ask: null }],
      ["sample not a boolean true", { sample: "yes" }],
      ["sample false", { sample: false }],
      ["empty id", { id: "" }],
      ["id not fr-N", { id: "idea-7" }],
    ]
    for (const [label, patch] of corruptions) {
      const good = seed()
      const bad = { ...good, requests: good.requests.map((r, i) => (i === 4 ? { ...r, ...patch } : r)) }
      expect(isRequest(bad.requests[4]), label).toBe(false)
      expect(isState(bad), label).toBe(false)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))
      expect(loadState(window.localStorage), label).toBeNull()
    }
  })

  it("refuses duplicate ids and a nextId that is not above every id in use", () => {
    const good = seed()
    expect(isState({ ...good, requests: [...good.requests, { ...good.requests[0] }] })).toBe(false)
    expect(isState({ ...good, nextId: 10 })).toBe(false) // fr-10 exists
    expect(isState({ ...good, nextId: 11 })).toBe(true)
    expect(isState({ ...good, nextId: 500 })).toBe(true)
    expect(isState({ requests: [], nextId: 1 })).toBe(true)
  })

  it("accepts a sound copy, with or without the sample flag", () => {
    const good = reducer(seed(), { type: "add", input: { title: "Mine" }, at: AT })
    expect(isState(good)).toBe(true)
    expect(isState(JSON.parse(JSON.stringify(good)))).toBe(true)
  })

  it("parks a rejected copy verbatim under the .rejected key, drops the live key, and warns in dev", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ requests: [{ id: "fr-1", title: "Mine" }], nextId: 2 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(storage.load(window.localStorage)).toEqual({ state: null, status: "rejected" })
    expect(rejectedRaw(window.localStorage)).toEqual([raw])
    expect(storage.rejected(window.localStorage)[0].why).toBe("failed validation")
    // Shared policy: the live key is dropped so the next load does not trip again.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(REJECTED_KEY)

    // Unparseable JSON is parked too, newest first.
    window.localStorage.setItem(STORAGE_KEY, "{not json")
    expect(loadState(window.localStorage)).toBeNull()
    expect(rejectedRaw(window.localStorage)).toEqual(["{not json", raw])
    warn.mockRestore()
  })

  it("does not warn or park anything when there is no copy or a good one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(storage.load(window.localStorage)).toEqual({ state: null, status: "empty" })
    saveState(window.localStorage, seed())
    expect(storage.load(window.localStorage)).toEqual({ state: seed(), status: "saved" })
    expect(storage.rejected(window.localStorage)).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

/* ------------------------------------------------------------- provider */

function Probe() {
  const { requests, now, persisted, edited, saved, saveFailed, addRequest, patchRequest, setStatus, resetDemoData } =
    useFeatureRequests()
  const first = requests[0]
  return (
    <div>
      <span data-testid="persisted">{String(persisted)}</span>
      <span data-testid="saved">{String(saved)}</span>
      <span data-testid="edited">{String(edited)}</span>
      <span data-testid="save-failed">{String(saveFailed)}</span>
      <span data-testid="now">{now.toISOString()}</span>
      <span data-testid="count">{requests.length}</span>
      <span data-testid="first">{first?.title ?? ""}</span>
      <span data-testid="first-created">{first?.createdAt ?? ""}</span>
      <span data-testid="fr-2-status">{requests.find((r) => r.id === "fr-2")?.status ?? ""}</span>
      <button type="button" onClick={() => addRequest({ title: "Probe idea" })}>add</button>
      <button type="button" onClick={() => addRequest({ title: "   " })}>add-nothing</button>
      <button type="button" onClick={() => setStatus("fr-2", "parked")}>park</button>
      <button type="button" onClick={() => setStatus("fr-2", "inbox")}>same-status</button>
      <button type="button" onClick={() => patchRequest("fr-2", { from: "Dan" })}>same-words</button>
      <button type="button" onClick={resetDemoData}>reset</button>
    </div>
  )
}

const mount = () =>
  render(
    <FeatureRequestsProvider nowMs={NOW_MS}>
      <Probe />
    </FeatureRequestsProvider>
  )

describe("FeatureRequestsProvider", () => {
  it("hydrates before the first paint, so there is no seed flash to see", () => {
    mount()
    // Synchronous: the layout effect ran inside render(), no await needed.
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("10")
  })

  it("takes its clock from the page and stamps every edit with it — no client clock reads", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z")) // a wildly different client clock
    try {
      mount()
      expect(screen.getByTestId("now")).toHaveTextContent(TODAY.toISOString())
      expect(screen.getByTestId("first-created")).toHaveTextContent(TODAY.toISOString())
      act(() => screen.getByRole("button", { name: "add" }).click())
      expect(screen.getByTestId("first-created")).toHaveTextContent(TODAY.toISOString())
      act(() => screen.getByRole("button", { name: "reset" }).click())
      expect(screen.getByTestId("first-created")).toHaveTextContent(TODAY.toISOString())
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not write the untouched seed, and no-op edits do not count", () => {
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    act(() => screen.getByRole("button", { name: "add-nothing" }).click())
    act(() => screen.getByRole("button", { name: "same-status" }).click())
    act(() => screen.getByRole("button", { name: "same-words" }).click())
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("edited")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("does not write a loaded copy back on mount", () => {
    const copy = reducer(seed(), { type: "add", input: { title: "Mine" }, at: AT })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(copy))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("first")).toHaveTextContent("Mine")
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it("persists from the first real edit on, and rehydrates after a remount (reload)", () => {
    const first = mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("edited")).toHaveTextContent("true")
    act(() => screen.getByRole("button", { name: "park" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("11")
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("parked")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"title":"Probe idea"')

    first.unmount()
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(screen.getByTestId("count")).toHaveTextContent("11")
    expect(screen.getByTestId("first")).toHaveTextContent("Probe idea")
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("parked")
  })

  it("Reset throws the browser's copy away entirely and shows a fresh seed", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    act(() => screen.getByRole("button", { name: "reset" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("10")
    expect(screen.getByTestId("first")).toHaveTextContent("Play of the Day")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("reports a failed save and keeps the edit for the session", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError")
    })
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(screen.getByTestId("count")).toHaveTextContent("11")
    expect(screen.getByTestId("save-failed")).toHaveTextContent("true")
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()

    // Storage comes back: the next edit writes everything and clears the flag.
    setItem.mockRestore()
    act(() => screen.getByRole("button", { name: "park" }).click())
    expect(screen.getByTestId("save-failed")).toHaveTextContent("false")
    expect(screen.getByTestId("saved")).toHaveTextContent("true")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe idea")
  })

  it("falls back to the seed when the saved copy has one bad item, parks it, and writes a clean copy only on the next edit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const bad = reducer(seed(), { type: "add", input: { title: "Mine" }, at: AT })
    bad.requests[3] = { ...bad.requests[3], status: "shipped" as never }
    const raw = JSON.stringify(bad)
    window.localStorage.setItem(STORAGE_KEY, raw)
    mount()
    expect(screen.getByTestId("saved")).toHaveTextContent("false")
    expect(screen.getByTestId("count")).toHaveTextContent("10")
    expect(screen.getByTestId("first")).toHaveTextContent("Play of the Day")
    expect(rejectedRaw(window.localStorage)).toEqual([raw])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull() // dropped by the shared loader
    expect(warn).toHaveBeenCalled()

    act(() => screen.getByRole("button", { name: "add" }).click())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("shipped")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Probe idea")
    expect(rejectedRaw(window.localStorage)).toEqual([raw]) // still parked
    warn.mockRestore()
  })

  describe("another tab", () => {
    const fire = (newValue: string | null, key: string | null = STORAGE_KEY) =>
      act(() => fireStorageEvent(key, newValue))

    it("re-hydrates when another tab writes the key", () => {
      mount()
      const theirs = reducer(seed(), { type: "add", input: { title: "From tab two" }, at: AT })
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
      fire(JSON.stringify(theirs))
      expect(screen.getByTestId("first")).toHaveTextContent("From tab two")
      expect(screen.getByTestId("saved")).toHaveTextContent("true")
      expect(screen.getByTestId("count")).toHaveTextContent("11")
    })

    it("returns to the seed when another tab resets, and ignores other keys", () => {
      mount()
      act(() => screen.getByRole("button", { name: "add" }).click())
      expect(screen.getByTestId("count")).toHaveTextContent("11")

      fire("whatever", "hotdash.some-other-page.v1")
      expect(screen.getByTestId("count")).toHaveTextContent("11")

      window.localStorage.removeItem(STORAGE_KEY)
      fire(null)
      expect(screen.getByTestId("count")).toHaveTextContent("10")
      expect(screen.getByTestId("saved")).toHaveTextContent("false")
      expect(screen.getByTestId("first-created")).toHaveTextContent(TODAY.toISOString())
    })

    it("does not write back what it just synced", () => {
      mount()
      const theirs = reducer(seed(), { type: "add", input: { title: "From tab two" }, at: AT })
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
      const setItem = vi.spyOn(Storage.prototype, "setItem")
      fire(JSON.stringify(theirs))
      expect(setItem).not.toHaveBeenCalled()
      setItem.mockRestore()
    })

    it("an emptied key re-seeds this tab and forgets it was edited here", () => {
      mount()
      act(() => screen.getByRole("button", { name: "add" }).click())
      expect(screen.getByTestId("edited")).toHaveTextContent("true")
      window.localStorage.removeItem(STORAGE_KEY)
      fire(null)
      expect(screen.getByTestId("count")).toHaveTextContent("10")
      expect(screen.getByTestId("edited")).toHaveTextContent("false")
      expect(screen.getByTestId("saved")).toHaveTextContent("false")
      // An empty string counts as emptied too.
      act(() => screen.getByRole("button", { name: "add" }).click())
      window.localStorage.setItem(STORAGE_KEY, "")
      fire("")
      expect(screen.getByTestId("count")).toHaveTextContent("10")
      expect(screen.getByTestId("edited")).toHaveTextContent("false")
    })

    it("two providers sharing one storage settle after a single write — no ping-pong", () => {
      // Two tabs, stood in for by two providers on one window. jsdom does
      // not fire `storage` across them, so the event is relayed by hand, the
      // way the browser would, after every write.
      const setItem = vi.spyOn(Storage.prototype, "setItem")
      const a = render(
        <FeatureRequestsProvider nowMs={NOW_MS}>
          <Probe />
        </FeatureRequestsProvider>
      )
      const b = render(
        <FeatureRequestsProvider nowMs={NOW_MS}>
          <Probe />
        </FeatureRequestsProvider>
      )
      const inA = within(a.container)
      const inB = within(b.container)
      expect(setItem).not.toHaveBeenCalled() // two hydrates, zero writes

      act(() => inA.getByRole("button", { name: "add" }).click())
      expect(setItem).toHaveBeenCalledTimes(1)
      const written = window.localStorage.getItem(STORAGE_KEY)!

      // Relay the event to everyone, as the browser would, until it is quiet.
      for (let round = 0; round < 3; round++) fire(written)
      expect(inB.getByTestId("first")).toHaveTextContent("Probe idea")
      expect(inB.getByTestId("saved")).toHaveTextContent("true")
      expect(inB.getByTestId("edited")).toHaveTextContent("false")
      expect(setItem).toHaveBeenCalledTimes(1) // B never wrote back

      // B edits: one more write, A follows, still nothing echoes.
      act(() => inB.getByRole("button", { name: "park" }).click())
      expect(setItem).toHaveBeenCalledTimes(2)
      for (let round = 0; round < 3; round++) fire(window.localStorage.getItem(STORAGE_KEY))
      expect(inA.getByTestId("fr-2-status")).toHaveTextContent("parked")
      expect(setItem).toHaveBeenCalledTimes(2)
      setItem.mockRestore()
    })
  })

  it("keeps the volatile clock out of the saved copy", () => {
    mount()
    act(() => screen.getByRole("button", { name: "add" }).click())
    const copy = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)
    expect(Object.keys(copy).sort()).toEqual(["nextId", "requests"])
    expect("now" in copy).toBe(false)
    expect("nowIso" in copy).toBe(false)
  })

  it("does not re-write a copy identical to what the key already holds (shared save)", () => {
    mount()
    act(() => screen.getByRole("button", { name: "park" }).click()) // write: fr-2 parked
    const parked = window.localStorage.getItem(STORAGE_KEY)!
    act(() => screen.getByRole("button", { name: "same-status" }).click()) // write: fr-2 inbox
    // Another tab puts the parked copy back; this tab follows without writing.
    window.localStorage.setItem(STORAGE_KEY, parked)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    act(() => fireStorageEvent(STORAGE_KEY, parked))
    expect(screen.getByTestId("fr-2-status")).toHaveTextContent("parked")
    expect(setItem).not.toHaveBeenCalled()
    // A real edit back to inbox writes; a sync of that same copy does not.
    act(() => screen.getByRole("button", { name: "same-status" }).click())
    expect(setItem).toHaveBeenCalledTimes(1)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(setItem).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })
})
