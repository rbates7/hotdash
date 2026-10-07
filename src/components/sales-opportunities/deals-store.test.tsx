import * as React from "react"
import { act, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CAPS, seedDeals, type Deal, type DealInput } from "@/lib/sales-opportunities"
import { initialShell, type LoadResult } from "@/lib/persistence"
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
  parseState,
  reducer,
  saveState,
  shellReducer,
  useDeals,
  type State,
} from "@/components/sales-opportunities/deals-store"
import { FIXED_NOW, FIXED_NOW_MS, LATE_EVENING_CT, LATE_EVENING_CT_MS } from "@/test/clock"
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

  it("hydrate (through the shell) takes a saved copy and re-seeds on empty or rejected", () => {
    const shell = { ...initialShell(seed(), FIXED_NOW_MS), persisted: true }
    const edited = shellReducer(
      shellReducer(shell, { type: "add-deal", input: WESTLAKE, at: AT }),
      { type: "save-result", ok: true }
    )
    const theirs = reducer(seed(), { type: "delete-deal", id: "deal-1" })
    expect(shellReducer(edited, hydrate(theirs)).data).toEqual(theirs)
    expect(shellReducer(edited, hydrate(null, "empty")).data).toEqual(seed())
    expect(shellReducer(edited, hydrate(null, "rejected")).data).toEqual(seed())
  })

  it("reset regenerates the seed for the instant given", () => {
    const shell = shellReducer({ ...initialShell(seed(), FIXED_NOW_MS), persisted: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    const later = Date.parse("2026-10-07T18:00:00.000Z")
    const after = shellReducer(shell, { type: "reset", nowMs: later })
    expect(after.data).toEqual(initialState(later))
    expect(after).toMatchObject({ edited: false, saved: false, saveFailed: false })
  })
})

describe("shellReducer bookkeeping (the shared shell)", () => {
  const fresh = () => ({ ...initialShell(seed(), FIXED_NOW_MS), persisted: true })

  it("a user edit marks edited and bumps the edit count; a no-op edit returns the same shell", () => {
    const shell = shellReducer(fresh(), { type: "add-deal", input: WESTLAKE, at: AT })
    expect(shell.edited).toBe(true)
    expect(shell.edits).toBe(1)
    const before = fresh()
    const noop = shellReducer(before, { type: "set-stage", id: "deal-1", stage: "proposal", at: AT })
    expect(noop).toBe(before)
  })

  /** An edit that has been written: the shell has nothing pending. */
  const savedEdit = () =>
    shellReducer(shellReducer(fresh(), { type: "add-deal", input: WESTLAKE, at: AT }), { type: "save-result", ok: true })

  it("a hydrate never moves the edit count, so it can never cause a write", () => {
    const after = shellReducer(savedEdit(), hydrate(seed()))
    expect(after.edits).toBe(1)
    expect(after.saved).toBe(true)
    expect(after.edited).toBe(false)
    expect(after.data).toEqual(seed())
  })

  it("a local edit that has not been saved yet wins over an incoming copy", () => {
    const pending = shellReducer(fresh(), { type: "add-deal", input: WESTLAKE, at: AT })
    const after = shellReducer(pending, hydrate(seed()))
    expect(after.data).toBe(pending.data)
    expect(after.edited).toBe(true)
    expect(after.saved).toBe(true)
  })

  it("an empty or removed key (Reset in another tab) re-seeds from the event's clock and clears edited", () => {
    const later = Date.parse("2026-10-07T18:00:00.000Z")
    const after = shellReducer(savedEdit(), { type: "hydrate", result: { state: null, status: "empty" }, nowMs: later })
    expect(after.data).toEqual(initialState(later))
    expect(after.nowMs).toBe(later)
    expect(after.edited).toBe(false)
    expect(after.saved).toBe(false)
    expect(after.edits).toBe(1)
  })

  it("an adopted copy never moves the clock", () => {
    const after = shellReducer(savedEdit(), { type: "hydrate", result: { state: seed(), status: "saved" }, nowMs: Date.parse("2026-10-07T18:00:00.000Z") })
    expect(after.nowMs).toBe(FIXED_NOW_MS)
  })

  it("save-result records the outcome without ever un-saving", () => {
    const edited = shellReducer({ ...fresh(), saved: true }, { type: "add-deal", input: WESTLAKE, at: AT })
    const failed = shellReducer(edited, { type: "save-result", ok: false })
    expect(failed).toMatchObject({ saved: true, saveFailed: true })
    const ok = shellReducer(failed, { type: "save-result", ok: true })
    expect(ok).toMatchObject({ saved: true, saveFailed: false })
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
    expect(parseState(extra)).toEqual(fromSaved(good))
    expect(parseState({ ...good, nextId: 1 })).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(extra))
    const loaded = loadState(window.localStorage)!
    expect(Object.keys(loaded).sort()).toEqual(["deals", "nextId"])
    expect("score" in loaded.deals[0]).toBe(false)
    expect(loaded).toEqual(fromSaved(good))
  })

  it("a rejected copy gives the page the seed without writing; the first real save parks it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = JSON.stringify({ ...good, nextId: 1 })
    window.localStorage.setItem(STORAGE_KEY, raw)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    expect(loadState(window.localStorage)).toBeNull()
    // load() is pure: the bad copy is still there and nothing was written.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw)
    expect(setItem).not.toHaveBeenCalled()
    expect(loadStateOrSeed(window.localStorage, FIXED_NOW_MS)).toEqual(seed())
    saveState(window.localStorage, reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT }))
    expect(dealsStorage.rejected(window.localStorage).map((c) => c.raw)).toEqual([raw])
    expect(loadState(window.localStorage)!.deals).toHaveLength(9)
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
    // A different copy into a full store fails; the identical one would no-op.
    const changed = reducer(s, { type: "delete-deal", id: "deal-1" })
    expect(saveState(quotaExceededStorage() as unknown as Storage, changed)).toBe(false)
  })

  it("the shared save writes once and then skips an identical copy", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    const s = reducer(seed(), { type: "add-deal", input: WESTLAKE, at: AT })
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(saveState(window.localStorage, s)).toBe(true)
    expect(saveState(window.localStorage, { ...s, deals: [...s.deals] })).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(saveState(window.localStorage, reducer(s, { type: "delete-deal", id: "deal-1" }))).toBe(true)
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(saveState(undefined, s)).toBe(false)
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

  it("derives today from the shell clock (the request's instant on mount) and stamps edits with the shared clock", () => {
    // 23:30 CT on 7 Oct — already the 8th in UTC; the page says the 7th.
    vi.useFakeTimers({ now: LATE_EVENING_CT, toFake: ["Date"] })
    mount(LATE_EVENING_CT_MS)
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("now")).toHaveTextContent(String(LATE_EVENING_CT_MS))
    vi.setSystemTime(LATE_EVENING_CT_MS + 60_000)
    click("win")
    // A touch is stamped at the moment it happens, through the one shared clock.
    expect(screen.getByTestId("touch-1")).toHaveTextContent("2026-10-08T04:31:00.000Z")
    // …and the page's clock does not move for an edit.
    expect(screen.getByTestId("now")).toHaveTextContent(String(LATE_EVENING_CT_MS))
    vi.useRealTimers()
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

  it("persists real edits, skips no-op edits, rehydrates after a remount, and Reset clears the key and re-seeds from now() via the shared clock", () => {
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

    // Before Reset the page still measures from the request's instant.
    expect(screen.getByTestId("today")).toHaveTextContent("2026-08-27")

    click("reset")
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false")
    // Re-seeded from now() (reseedNowMs), and the clock moved with it.
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    expect(screen.getByTestId("now")).toHaveTextContent(String(Date.parse("2026-10-07T18:00:00.000Z")))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("stage-1")).toHaveTextContent("proposal")
    expect(screen.getByTestId("touch-1")).toHaveTextContent("2026-10-06T17:00:00.000Z")
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
    // Their copy is theirs: nothing of ours is pending, but the key is saved.
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=true")

    // Reset elsewhere: back to the seed here too, dated from now() (the
    // sync hook's clock read), and nothing of ours is left.
    vi.useFakeTimers({ now: new Date("2026-10-07T18:00:00.000Z"), toFake: ["Date"] })
    window.localStorage.removeItem(STORAGE_KEY)
    act(() => fireStorageEvent(STORAGE_KEY, null))
    expect(screen.getByTestId("count")).toHaveTextContent("8")
    expect(screen.getByTestId("stage-1")).toHaveTextContent("proposal")
    expect(screen.getByTestId("status")).toHaveTextContent("edited=false saved=false failed=false")
    expect(screen.getByTestId("today")).toHaveTextContent("2026-10-07")
    vi.useRealTimers()
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
