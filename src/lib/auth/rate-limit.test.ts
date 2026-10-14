import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_FAILURES, WINDOW_MS, createRateLimiter, minutesUntil } from "@/lib/auth/rate-limit"
import { FIXED_NOW } from "@/test/clock"

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW })
})

afterEach(() => {
  vi.useRealTimers()
})

const KEY = "203.0.113.7|founder@example.test"

describe("createRateLimiter", () => {
  it("allows four failures and locks on the fifth", () => {
    const limiter = createRateLimiter()
    for (let i = 1; i < MAX_FAILURES; i++) {
      expect(limiter.fail(KEY)).toEqual({ allowed: true })
    }
    expect(limiter.fail(KEY)).toEqual({ allowed: false, retryAfterMs: WINDOW_MS })
    expect(limiter.check(KEY).allowed).toBe(false)
  })

  it("unlocks when the oldest failure leaves the 15-minute window", () => {
    const limiter = createRateLimiter()
    limiter.fail(KEY)
    vi.advanceTimersByTime(60_000)
    for (let i = 1; i < MAX_FAILURES; i++) limiter.fail(KEY)

    vi.advanceTimersByTime(WINDOW_MS - 60_000 - 1)
    expect(limiter.check(KEY)).toEqual({ allowed: false, retryAfterMs: 1 })
    vi.advanceTimersByTime(1)
    expect(limiter.check(KEY)).toEqual({ allowed: true })
  })

  it("counts each IP + email key separately", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < MAX_FAILURES; i++) limiter.fail(KEY)
    expect(limiter.check(KEY).allowed).toBe(false)
    expect(limiter.check("198.51.100.1|founder@example.test").allowed).toBe(true)
    expect(limiter.check("203.0.113.7|other@example.test").allowed).toBe(true)
  })

  it("reset() clears a key after a good sign-in", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < MAX_FAILURES - 1; i++) limiter.fail(KEY)
    limiter.reset(KEY)
    expect(limiter.fail(KEY)).toEqual({ allowed: true })
  })

  it("forgets expired keys instead of growing forever", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 1000; i++) limiter.fail(`ip-${i}|a@b.c`)
    expect(limiter.size()).toBe(1000)
    vi.advanceTimersByTime(WINDOW_MS)
    limiter.fail(KEY)
    expect(limiter.size()).toBe(1)
  })
})

describe("minutesUntil", () => {
  it("rounds up and never says 0", () => {
    expect(minutesUntil(WINDOW_MS)).toBe(15)
    expect(minutesUntil(60_001)).toBe(2)
    expect(minutesUntil(1)).toBe(1)
    expect(minutesUntil(0)).toBe(1)
  })
})
