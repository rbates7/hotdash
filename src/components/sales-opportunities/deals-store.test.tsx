import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CAPS, seedDeals, type Deal, type DealInput } from "@/lib/sales-opportunities"
import type { LoadResult } from "@/lib/persistence"
import {
  DealsProvider,
  STORAGE_KEY,
  dealsStorage,
  fromSaved,
  initialState,
  isState,
  loadState,
  loadStateOrSeed,
  normalizeInput,
  reducer,
  saveIfChanged,
  saveState,
  shellReducer,
  useDeals,
  type State,
} from "@/components/sales-opportunities/deals-store"
import { FIXED_NOW, FIXED_NOW_MS } from "@/test/clock"
import { fireStorageEvent, quotaExceededStorage } from "@/test/storage"

const AT = FIXED_NOW.toISOString()
const LATER = "2026-08-27T15:00:00.000Z"

const WESTLAKE: DealInput = {
  who: "  Coach Jordan Reyes ",
  org: "Westlake HS",
  what: "Staff seats × 6",
  value: 1_799.6,
  stage: "talking",
  nextStep: "Send the quote",
  nextStepDue: "2026-09-02",
  owner: "Trip",
}

const seed = () => initialState(FIXED_NOW_MS)
const hydrate = (state: State | null, status: LoadResult<State>["status"] = state ? "saved" : "empty") =>
  ({ type: "hydrate", result: (state ? { state, status: "saved" } : { state: null, status }) as LoadResult<State>, nowMs: FIXED_NOW_MS }) as const

afterEach(() => vi.restoreAllMocks())

describe("reducer", () => {
  it("starts with the eight seed deals and the next id above them", () => {
    const s = seed()
    expect(s.deals).toEqual(seedDeals(FIXED_NOW_MS))
    expect(s.nextId).toBe(9)
  })

  it("adds a deal at the end, trimmed, rounded, unsampled, stamped with the given instant", () => {
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    const added = s.deals.at(-1)!
    expect(added).toEqual({
      id: "deal-9",
      who: "Coach Jordan Reyes",
      org: "Westlake HS",
      what: "Staff seats × 6",
      value: 1_800,
      stage: "talking",
      nextStep: "Send the quote",
      nextStepDue: "2026-09-02",
      owner: "Trip",
      lastTouch: AT,
      createdAt: AT,
      updatedAt: AT,
      sample: false,
    })
    expect(s.nextId).toBe(10)
  })

  it("refuses an add with a blank required field", () => {
    const s = seed()
    expect(reducer(s, { type: "add-deal", input: { ...WESTLAKE, who: "  " }, at: AT })).toBe(s)
    expect(reducer(s, { type: "add-deal", input: { ...WESTLAKE, nextStep: "" }, at: AT })).toBe(s)
  })

  it("caps every string and the value on the way in", () => {
    const long = {
      ...WESTLAKE,
      who: "w".repeat(200),
      org: "o".repeat(200),
      what: "x".repeat(200),
      nextStep: "n".repeat(300),
      value: 99_999_999,
    }
    const n = normalizeInput(long)
    expect(n.who).toHaveLength(CAPS.who)
    expect(n.org).toHaveLength(CAPS.org)
    expect(n.what).toHaveLength(CAPS.what)
    expect(n.nextStep).toHaveLength(CAPS.nextStep)
    expect(n.value).toBe(CAPS.value)
    expect(normalizeInput({ ...WESTLAKE, value: -5 }).value).toBe(0)
    expect(normalizeInput({ ...WESTLAKE, value: Number.NaN }).value).toBeNull()
  })

  it("an edit that changes nothing returns the same state and does not bump updatedAt", () => {
    const s = seed()
    const deal = s.deals[0]
    const same: DealInput = {
      who: deal.who,
      org: deal.org,
      what: deal.what,
      value: deal.value,
      stage: deal.stage,
      nextStep: deal.nextStep,
      nextStepDue: deal.nextStepDue,
      owner: deal.owner,
    }
    expect(reducer(s, { type: "edit-deal", id: deal.id, input: same, at: LATER })).toBe(s)
    // Whitespace that trims away is still a no-op.
    expect(reducer(s, { type: "edit-deal", id: deal.id, input: { ...same, who: `  ${deal.who} ` }, at: LATER })).toBe(s)
    expect(reducer(s, { type: "edit-deal", id: "deal-404", input: same, at: LATER })).toBe(s)
  })

  it("a real edit replaces the fields and counts as a touch", () => {
    const s = seed()
    const deal = s.deals[0]
    const next = reducer(s, {
      type: "edit-deal",
      id: deal.id,
      input: { ...WESTLAKE, who: deal.who, org: deal.org, value: 4_000 },
      at: LATER,
    })
    const edited = next.deals[0]
    expect(edited.value).toBe(4_000)
    expect(edited.what).toBe("Staff seats × 6")
    expect(edited.lastTouch).toBe(LATER)
    expect(edited.updatedAt).toBe(LATER)
    expect(edited.createdAt).toBe(deal.createdAt)
    expect(edited.sample).toBe(true)
    expect(next.deals.slice(1)).toEqual(s.deals.slice(1))
  })

  it("set-stage moves the deal and touches it; the same stage is a no-op", () => {
    const s = seed()
    expect(reducer(s, { type: "set-stage", id: "deal-1", stage: "proposal", at: LATER })).toBe(s)
    const next = reducer(s, { type: "set-stage", id: "deal-1", stage: "closed-won", at: LATER })
    expect(next.deals[0].stage).toBe("closed-won")
    expect(next.deals[0].lastTouch).toBe(LATER)
    expect(reducer(s, { type: "set-stage", id: "nope", stage: "verbal", at: LATER })).toBe(s)
  })

  it("complete-next-step swaps in the new step and date and touches; a blank step is refused", () => {
    const s = seed()
    const next = reducer(s, { type: "complete-next-step", id: "deal-3", nextStep: "  Install call ", nextStepDue: null, at: LATER })
    const d = next.deals.find((x) => x.id === "deal-3")!
    expect(d.nextStep).toBe("Install call")
    expect(d.nextStepDue).toBeNull()
    expect(d.lastTouch).toBe(LATER)
    expect(reducer(s, { type: "complete-next-step", id: "deal-3", nextStep: "   ", nextStepDue: null, at: LATER })).toBe(s)
  })

  it("deletes by id; a missing id is a no-op", () => {
    const s = seed()
    const next = reducer(s, { type: "delete-deal", id: "deal-2" })
    expect(next.deals.map((d) => d.id)).not.toContain("deal-2")
    expect(next.nextId).toBe(9)
    expect(reducer(s, { type: "delete-deal", id: "deal-404" })).toBe(s)
  })

  it("hydrate takes a saved copy, re-seeds on empty or rejected, keeps state on error", () => {
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    const theirs = reducer(seed(), { type: "delete-deal", id: "deal-1" })
    expect(reducer(s, hydrate(theirs))).toEqual(theirs)
    expect(reducer(s, hydrate(null, "empty"))).toEqual(seed())
    expect(reducer(s, hydrate(null, "rejected"))).toEqual(seed())
    expect(reducer(s, hydrate(null, "error"))).toBe(s)
  })

  it("reset regenerates the seed for the instant given", () => {
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    const later = Date.parse("2026-10-07T18:00:00.000Z")
    expect(reducer(s, { type: "reset", nowMs: later })).toEqual(initialState(later))
  })
})

describe("shellReducer bookkeeping", () => {
  const fresh = () => ({ data: seed(), hydrated: false, edited: false, saved: false, saveFailed: false, dirty: false })

  it("a user edit marks edited and dirty; a no-op edit marks nothing", () => {
    const shell = shellReducer({ ...fresh(), hydrated: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    expect(shell.edited).toBe(true)
    expect(shell.dirty).toBe(true)
    const noop = shellReducer({ ...fresh(), hydrated: true }, { type: "set-stage", id: "deal-1", stage: "proposal", at: AT })
    expect(noop.edited).toBe(false)
    expect(noop.dirty).toBe(false)
  })

  it("a hydrate never leaves dirty set, so it can never cause a save", () => {
    const edited = shellReducer({ ...fresh(), hydrated: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    const after = shellReducer(edited, hydrate(seed()))
    expect(after.dirty).toBe(false)
    expect(after.saved).toBe(true)
    expect(after.edited).toBe(true) // ours stays ours
  })

  it("an empty or removed key (Reset in another tab) re-seeds and clears edited", () => {
    const edited = shellReducer({ ...fresh(), hydrated: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    const after = shellReducer(edited, hydrate(null, "empty"))
    expect(after.data).toEqual(seed())
    expect(after.edited).toBe(false)
    expect(after.saved).toBe(false)
    expect(after.dirty).toBe(false)
  })

  it("save-result clears dirty and records the outcome without ever un-saving", () => {
    const edited = shellReducer({ ...fresh(), hydrated: true, saved: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    const failed = shellReducer(edited, { type: "save-result", ok: false })
    expect(failed).toMatchObject({ dirty: false, saved: true, saveFailed: true })
    const ok = shellReducer(failed, { type: "save-result", ok: true })
    expect(ok).toMatchObject({ dirty: false, saved: true, saveFailed: false })
  })
})

describe("isState rejects a bad saved copy", () => {
  const good = seed()
  const cases: [string, unknown][] = [
    ["not an object", "nope"],
    ["an array", [good]],
    ["deals not an array", { ...good, deals: {} }],
    ["a deal with an unknown stage", { ...good, deals: [{ ...good.deals[0], stage: "won" }] }],
    ["a deal with an unknown owner", { ...good, deals: [{ ...good.deals[0], owner: "Hunter" }] }],
    ["an impossible due date", { ...good, deals: [{ ...good.deals[0], nextStepDue: "2026-02-30" }] }],
    ["a who past its cap", { ...good, deals: [{ ...good.deals[0], who: "w".repeat(CAPS.who + 1) }] }],
    ["a value past its cap", { ...good, deals: [{ ...good.deals[0], value: CAPS.value + 1 }] }],
    ["duplicate ids", { ...good, deals: [good.deals[0], good.deals[0]] }],
    ["nextId not above the highest id", { ...good, nextId: 8 }],
    ["nextId fractional", { ...good, nextId: 9.5 }],
    ["nextId missing", { deals: good.deals }],
    ["nextId as a string", { ...good, nextId: "9" }],
  ]

  it.each(cases)("%s", (_name, value) => {
    expect(isState(value)).toBe(false)
  })

  it("accepts the seed and an edited copy", () => {
    expect(isState(good)).toBe(true)
    expect(isState(reducer(good, { type: "add-deal", input: WESTLAKE, at: AT }))).toBe(true)
    expect(isState({ deals: [], nextId: 1 })).toBe(true)
  })

  it("strips unknown keys at both levels on load", () => {
    const extra = {
      ...good,
      hunts: ["FCS", "D2"],
      deals: good.deals.map((d) => ({ ...d, score: 3 })),
    }
    expect(isState(extra)).toBe(true)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(extra))
    const loaded = loadState(window.localStorage)!
    expect(Object.keys(loaded).sort()).toEqual(["deals", "nextId"])
    expect("score" in loaded.deals[0]).toBe(false)
    expect(loaded).toEqual(fromSaved(good))
  })

  it("a rejected copy is parked under <key>.rejected and the page gets the seed", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    expect(loadState(window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(dealsStorage.rejectedKey)).toBe(raw)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW_MS)).toEqual(seed())
  })
})

describe("localStorage", () => {
  it("uses the v1 key", () => {
    expect(STORAGE_KEY).toBe("hotdash.sales-opportunities.v1")
    expect(dealsStorage.key).toBe(STORAGE_KEY)
  })

  it("saves and loads the same state; a failed save returns false", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(loadState(window.localStorage)).toEqual(s)
    expect(saveState(quotaExceededStorage() as unknown as Storage, s)).toBe(false)
  })

  it("saveIfChanged writes once and then skips an identical copy", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    expect(saveIfChanged(window.localStorage, s)).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(saveIfChanged(window.localStorage, s)).toBe(true)
    expect(saveIfChanged(window.localStorage, { ...s, deals: [...s.deals] })).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(saveIfChanged(window.localStorage, reducer(s, { type: "delete-deal", id: "deal-1" }))).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(saveIfChanged(undefined, s)).toBe(false)
  })
})

/* ---------------------------------------------------------------- provider */

function Probe({ label = "" }: { label?: string }) {
  const { deals, today, nowMs, persisted, edited, saved, saveFailed, addDeal, setStage, editDeal, resetDemoData } = useDeals()
  return (
    <div data-testid={`probe${label}`}>
      <span data-testid={`persisted${label}`}>{String(persisted)}</span>
      <span data-testid={`status${label}`}>{`edited=${edited} saved=${saved} failed=${saveFailed}`}</span>
      <span data-testid={`today${label}`}>{today}</span>
      <span data-testid={`now${label}`}>{nowMs}</span>
      <span data-testid={`count${label}`}>{deals.length}</span>
      <span data-testid={`ids${label}`}>{deals.map((d) => d.id).join(",")}</span>
      <span data-testid={`stage-1${label}`}>{deals.find((d) => d.id === "deal-1")?.stage ?? "gone"}</span>
      <span data-testid={`touch-1${label}`}>{deals.find((d) => d.id === "deal-1")?.lastTouch ?? "gone"}</span>
      <button type="button" onClick={() => addDeal(WESTLAKE)}>add</button>
      <button type="button" onClick={() => setStage("deal-1", "closed-won")}>win</button>
      <button type="button" onClick={() => setStage("deal-1", "proposal")}>noop</button>
      <button type="button" onClick={() => { const d = deals[0]; editDeal(d.id, { who: d.who, org: d.org, what: d.what, value: d.value, stage: d.stage, nextStep: d.nextStep, nextStepDue: d.nextStepDue, owner: d.owner }) }}>
        edit-same
      </button>
      <button type="button" onClick={resetDemoData}>reset</button>
    </div>
  )
}

const mount = (nowMs = FIXED_NOW_MS) =>
  render(
    <DealsProvider nowMs={nowMs}>
      <Probe />
    </DealsProvider>
  )

const click = (name: string, root: HTMLElement | typeof screen = screen) =>
  act(() => (root === screen ? screen : within(root as HTMLElement)).getByRole("button", { name }).click())

describe("DealsProvider persistence", () => {
  it("does not write the untouched seed on first load", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })

  it("derives today and every stamp from the instant it was given, never a client clock", () => {
    // 23:30 CT on 7 Oct — already the 8th in UTC.
    const late = Date.parse("2026-10-08T04:30:00.000Z")
    mount(late)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("now")).toHaveTextContent(String(late))
    click("win")
    // The stamp is the page's instant, not the real clock this test runs at.
    expect(screen.getByTestId("touch-1")).toHaveTextContent("2026-10-08T04:30:00.000Z")
  })

  it("is hydrated before the first paint, so saved data never follows a flash of seed", () => {
    saveState(window.localStorage, reducer(seed(), { type: "delete-deal", id: "deal-1" }))
    mount()
    expect(screen.getByTestId("persisted")).toHaveTextContent("true")
    expect(screen.getByTestId("ids")).not.toHaveTextContent("deal-1,")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")
  })

  it("hydrating a saved copy never writes it back", () => {
    saveState(window.localStorage, reducer(seed(), { type: "delete-deal", id: "deal-1" }))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    mount()
    expect(screen.getByTestId("stage-1")).toHaveTextContent("gone")
    expect(setItem).not.toHaveBeenCalled()
  })

  it("persists real edits, skips no-op edits, rehydrates after a remount, and Reset clears the key and re-dates from now", () => {
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const first = mount()
    click("noop")
    click("edit-same")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(setItem).not.toHaveBeenCalled()

    click("add")
    click("win")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true failed=false")
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"Coach Jordan Reyes"')
    // No clock in the saved copy.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain('"now')
    expect(setItem).toHaveBeenCalledTimes(2)

    first.unmount()
    mount()
    expect(screen.getByTestId("count")).toHaveTextContent("9")
    expect(screen.getByTestId("stage-1")).toHaveTextContent("closed-won")
    expect(setItem).toHaveBeenCalledTimes(2)

    click("reset")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("stage-1")).toHaveTextContent("proposal")
    expect(setItem).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("reports a failed save and never claims Saved", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const full = quotaExceededStorage()
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(full.setItem)
    mount()
    click("add")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=false failed=true")
    spy.mockRestore()
  })

  it("re-hydrates when another tab writes the key, and re-seeds with edited=false when another tab clears it", () => {
    mount()
    click("add")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    const theirs = reducer(seed(), { type: "delete-deal", id: "deal-1" })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theirs))
    act(() => fireStorageEvent(STORAGE_KEY, JSON.stringify(theirs)))
    expect(screen.getByTestId("stage-1")).toHaveTextContent("gone")
    expect(screen.getByTestId("count")).toHaveTextContent("7")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=true saved=true")

    // Reset elsewhere: back to the seed here too, and nothing of ours is left.
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("stage-1")).toHaveTextContent("proposal")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
  })

  it("two providers on one key never ping-pong: a hydrate is not a save, and writes settle", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(
      <>
        <DealsProvider nowMs={FIXED_NOW_MS}>
          <Probe label="-a" />
        </DealsProvider>
        <DealsProvider nowMs={FIXED_NOW_MS}>
          <Probe label="-b" />
        </DealsProvider>
      </>
    )
    expect(setItem).not.toHaveBeenCalled()

    // Tab A edits: exactly one write.
    click("add", screen.getByTestId("probe-a"))
    expect(setItem).toHaveBeenCalledTimes(1)
    const written = window.localStorage.getItem(STORAGE_KEY)!

    // The browser delivers A's write to B as a storage event. B hydrates
    // and must not write anything back.
    act(() => fireStorageEvent(STORAGE_KEY, written))
    expect(screen.getByTestId("count-b")).toHaveTextContent("9")
    expect(screen.getByTestId("status-b")).toHaveTextContent("edited=false saved=true")
    await act(() => Promise.resolve())
    expect(setItem).toHaveBeenCalledTimes(1)

    // B edits: one more write; A hears it and stays quiet.
    click("win", screen.getByTestId("probe-b"))
    expect(setItem).toHaveBeenCalledTimes(2)
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    expect(screen.getByTestId("stage-1-a")).toHaveTextContent("closed-won")
    await act(() => Promise.resolve())
    expect(setItem).toHaveBeenCalledTimes(2)

    // Even a spurious event carrying the same copy changes nothing.
    act(() => fireStorageEvent(STORAGE_KEY, window.localStorage.getItem(STORAGE_KEY)))
    await act(() => Promise.resolve())
    expect(setItem).toHaveBeenCalledTimes(2)
  })
})

describe("types", () => {
  it("Deal has exactly the keys the guard checks", () => {
    const d: Deal = seed().deals[0]
    expect(Object.keys(d).sort()).toEqual(
      ["createdAt", "id", "lastTouch", "nextStep", "nextStepDue", "org", "owner", "sample", "stage", "updatedAt", "value", "what", "who"]
    )
  })
})
