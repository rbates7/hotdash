import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { snapshotFor } from "@/lib/kpis"
import {
  LOADING_STATE,
  POLL_MS,
  RETRY_MS,
  SAMPLE_CADENCE_MS,
  SAMPLE_COUNT_KEY,
  SAMPLE_PATTERN,
  createSampleSource,
  createTickerStore,
  failuresOf,
  initialState,
  retryDelay,
  sampleBase,
  sampleCountOverride,
  sampleReadingAt,
  staleLabel,
  tickerReducer,
  type SubscriberReading,
  type SubscriberSource,
  type TickerState,
} from "@/lib/subscriber-source"

const AT = new Date("2026-10-13T14:41:00Z") // 9:41 AM CDT
const reading = (total: number, today = 0, at = AT): SubscriberReading => ({ total, today, at })

describe("tickerReducer", () => {
  it("loading → ready on a reading, → error on a failure (never a 0)", () => {
    expect(tickerReducer(LOADING_STATE, { type: "reading", reading: reading(5) })).toEqual({
      status: "ready",
      reading: reading(5),
    })
    expect(tickerReducer(LOADING_STATE, { type: "failure" })).toEqual({ status: "error", failures: 1 })
  })

  it("keeps the last good value when a refresh fails (stale)", () => {
    const ready: TickerState = { status: "ready", reading: reading(1_284, 3) }
    const stale = tickerReducer(ready, { type: "failure" })
    expect(stale).toEqual({ status: "stale", reading: reading(1_284, 3), failures: 1 })
    expect(tickerReducer(stale, { type: "failure" })).toMatchObject({ status: "stale", failures: 2 })
    expect(tickerReducer(stale, { type: "reading", reading: reading(1_285) })).toEqual({
      status: "ready",
      reading: reading(1_285),
    })
  })

  it("counts consecutive failures before any value", () => {
    const once = tickerReducer(LOADING_STATE, { type: "failure" })
    expect(tickerReducer(once, { type: "failure" })).toEqual({ status: "error", failures: 2 })
    expect(failuresOf(once)).toBe(1)
    expect(failuresOf(LOADING_STATE)).toBe(0)
  })
})

describe("retryDelay", () => {
  it("backs off 15s, 30s, then 60s", () => {
    expect(retryDelay(1)).toBe(15_000)
    expect(retryDelay(2)).toBe(30_000)
    expect(retryDelay(3)).toBe(60_000)
    expect(retryDelay(9)).toBe(60_000)
    expect(RETRY_MS).toEqual([15_000, 30_000, 60_000])
  })
})

describe("staleLabel", () => {
  it("is the time part of the shared wall clock, in the founder's zone", () => {
    expect(staleLabel(AT, "America/Chicago")).toBe("as of 9:41 AM CDT")
    expect(staleLabel(AT, "America/Los_Angeles")).toBe("as of 7:41 AM PDT")
    expect(staleLabel(AT, "UTC")).toBe("as of 2:41 PM UTC")
  })
})

describe("sample source", () => {
  const start = AT.getTime()
  const zone = "America/Chicago"

  it("starts on the Metrics page's Subscribers figure", () => {
    expect(sampleBase(AT)).toBe(snapshotFor("subscribers", { today: AT }).value)
    expect(sampleReadingAt(start, AT, zone)).toEqual({ total: sampleBase(AT), today: 0, at: AT })
  })

  it("adds a simulated batch every cadence, cycling the pattern", () => {
    const base = sampleBase(AT)
    const after = (ticks: number) => new Date(start + ticks * SAMPLE_CADENCE_MS)
    expect(sampleReadingAt(start, new Date(start + SAMPLE_CADENCE_MS - 1), zone).total).toBe(base)
    expect(sampleReadingAt(start, after(1), zone)).toMatchObject({ total: base + 1, today: 1 })
    const cycle = SAMPLE_PATTERN.reduce((a, b) => a + b, 0)
    expect(sampleReadingAt(start, after(SAMPLE_PATTERN.length), zone)).toMatchObject({
      total: base + cycle,
      today: cycle,
    })
  })

  it("counts today from 00:00 in the founder's zone", () => {
    // Opened at 11:59:30 PM Central; two batches before midnight, rest after.
    const open = new Date("2026-10-14T04:59:00Z").getTime()
    const at = new Date(open + 3 * SAMPLE_CADENCE_MS + 1)
    const r = sampleReadingAt(open, at, zone, 100)
    // Ticks land at :20, :40 (Oct 13) and 12:00:00 (Oct 14).
    expect(r.total).toBe(100 + SAMPLE_PATTERN[0] + SAMPLE_PATTERN[1] + SAMPLE_PATTERN[2])
    expect(r.today).toBe(SAMPLE_PATTERN[2])
    // Same instants, UTC zone: all on Oct 14.
    expect(sampleReadingAt(open, at, "UTC", 100).today).toBe(r.total - 100)
  })

  it("never counts backwards before the page opened", () => {
    expect(sampleReadingAt(start, new Date(start - 60_000), zone).total).toBe(sampleBase(AT))
  })

  describe("timers", () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(AT)
    })
    afterEach(() => vi.useRealTimers())

    it("initial is always the page-open figure, however long the module has been loaded", async () => {
      const source = createSampleSource({ startMs: start - 3_600_000 })
      expect(source.initial({ timeZone: zone })).toMatchObject({ total: sampleBase(AT), today: 0 })
      expect(source.sample).toBe(true)
    })

    it("pushes on every simulated sign-up while subscribed", async () => {
      const source = createSampleSource({ startMs: start })
      const onChange = vi.fn()
      const stop = source.subscribe!(onChange)
      vi.advanceTimersByTime(SAMPLE_CADENCE_MS - 1)
      expect(onChange).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onChange).toHaveBeenCalledTimes(1)
      await expect(source.read({ timeZone: zone })).resolves.toMatchObject({ total: sampleBase(AT) + 1 })
      vi.advanceTimersByTime(SAMPLE_CADENCE_MS)
      expect(onChange).toHaveBeenCalledTimes(2)
      stop()
      vi.advanceTimersByTime(SAMPLE_CADENCE_MS * 3)
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    it("test hook: a pinned count replaces the sample reads, not the first paint", async () => {
      const store = new Map([[SAMPLE_COUNT_KEY, "99999"]])
      const source = createSampleSource({ startMs: start, storage: () => ({ getItem: (k) => store.get(k) ?? null }) })
      expect(source.initial({ timeZone: zone })).toMatchObject({ total: sampleBase(AT) })
      await expect(source.read({ timeZone: zone })).resolves.toMatchObject({ total: 99_999, today: 0 })
      vi.advanceTimersByTime(SAMPLE_CADENCE_MS * 3)
      await expect(source.read({ timeZone: zone })).resolves.toMatchObject({ total: 99_999, today: 0 })
    })
  })
})

describe("sampleCountOverride", () => {
  const storage = (value: string | null) => ({ getItem: (k: string) => (k === SAMPLE_COUNT_KEY ? value : null) })

  it("reads a whole number from the test key", () => {
    expect(SAMPLE_COUNT_KEY).toBe("hotdash.test.subscriberCount")
    expect(sampleCountOverride(storage("99999"))).toBe(99_999)
    expect(sampleCountOverride(storage("0"))).toBe(0)
  })

  it("is null when unset, malformed, or storage is missing or throws", () => {
    expect(sampleCountOverride(storage(null))).toBeNull()
    expect(sampleCountOverride(storage(""))).toBeNull()
    expect(sampleCountOverride(storage("-5"))).toBeNull()
    expect(sampleCountOverride(storage("12.5"))).toBeNull()
    expect(sampleCountOverride(storage("lots"))).toBeNull()
    expect(sampleCountOverride(null)).toBeNull()
    expect(sampleCountOverride(undefined)).toBeNull()
    expect(
      sampleCountOverride({
        getItem: () => {
          throw new Error("denied")
        },
      })
    ).toBeNull()
  })
})

describe("createTickerStore", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const flush = async () => {
    await vi.advanceTimersByTimeAsync(0)
  }

  function fakeSource(
    reads: Array<SubscriberReading | Error>,
    { initial = null as SubscriberReading | null } = {}
  ) {
    let push: (() => void) | null = null
    const read = vi.fn(async () => {
      const next = reads.length > 1 ? reads.shift()! : reads[0]
      if (next instanceof Error) throw next
      return next
    })
    const source: SubscriberSource = {
      sample: false,
      initial: () => initial,
      read,
      subscribe: (fn) => {
        push = fn
        return () => {
          push = null
        }
      },
    }
    return { source, read, push: () => push?.() }
  }

  it("starts loading for a source with no synchronous reading", () => {
    const { source } = fakeSource([reading(1)])
    expect(initialState(source, { timeZone: "UTC" })).toEqual(LOADING_STATE)
    expect(createTickerStore(source, { timeZone: "UTC" }).getState()).toEqual(LOADING_STATE)
  })

  it("starts ready on a source's initial reading", () => {
    const { source } = fakeSource([reading(7)], { initial: reading(7) })
    expect(createTickerStore(source, { timeZone: "UTC" }).getState()).toEqual({
      status: "ready",
      reading: reading(7),
    })
  })

  it("reads on subscribe, polls every 60s and on every push", async () => {
    const { source, read, push } = fakeSource([reading(1), reading(2), reading(3)])
    const store = createTickerStore(source, { timeZone: "UTC" })
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    await flush()
    expect(store.getState()).toEqual({ status: "ready", reading: reading(1) })
    push()
    await flush()
    expect(store.getState()).toMatchObject({ reading: { total: 2 } })
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(store.getState()).toMatchObject({ reading: { total: 3 } })
    expect(read).toHaveBeenCalledTimes(3)
    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it("does not notify when a read brings the same figures", async () => {
    const { source } = fakeSource([reading(4)], { initial: reading(4) })
    const store = createTickerStore(source, { timeZone: "UTC" })
    const listener = vi.fn()
    store.subscribe(listener)
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })

  it("retries on the 15s / 30s / 60s backoff, then goes back to polling", async () => {
    const boom = new Error("stripe down")
    const { source, read } = fakeSource([boom, boom, boom, reading(9)])
    const store = createTickerStore(source, { timeZone: "UTC" })
    store.subscribe(() => {})
    await flush()
    expect(store.getState()).toEqual({ status: "error", failures: 1 })
    await vi.advanceTimersByTimeAsync(15_000 - 1)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.getState()).toEqual({ status: "error", failures: 2 })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(store.getState()).toEqual({ status: "error", failures: 3 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(store.getState()).toEqual({ status: "ready", reading: reading(9) })
    expect(read).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(POLL_MS - 1)
    expect(read).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it("goes stale, keeping the last good value, when a refresh fails", async () => {
    const { source } = fakeSource([reading(1_284, 3), new Error("timeout")])
    const store = createTickerStore(source, { timeZone: "UTC" })
    store.subscribe(() => {})
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(store.getState()).toEqual({ status: "stale", reading: reading(1_284, 3), failures: 1 })
  })

  it("refresh reads straight away (the error dot's Retry)", async () => {
    const { source, read } = fakeSource([new Error("x"), reading(2)])
    const store = createTickerStore(source, { timeZone: "UTC" })
    store.subscribe(() => {})
    await flush()
    expect(store.getState().status).toBe("error")
    store.refresh()
    await flush()
    expect(store.getState()).toEqual({ status: "ready", reading: reading(2) })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("ignores a read that lands after the last listener left", async () => {
    let resolve: (r: SubscriberReading) => void = () => {}
    const source: SubscriberSource = {
      sample: false,
      initial: () => null,
      read: () => new Promise((r) => (resolve = r)),
    }
    const store = createTickerStore(source, { timeZone: "UTC" })
    const stop = store.subscribe(() => {})
    stop()
    resolve(reading(5))
    await flush()
    expect(store.getState()).toEqual(LOADING_STATE)
  })
})
