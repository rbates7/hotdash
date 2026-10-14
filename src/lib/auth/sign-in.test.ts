import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getAuthConfig, type AuthConfig } from "@/lib/auth/config"
import { AUTH_COPY } from "@/lib/auth/messages"
import { hashPassword } from "@/lib/auth/password"
import { MAX_FAILURES, WINDOW_MS, createRateLimiter } from "@/lib/auth/rate-limit"
import { attemptSignIn } from "@/lib/auth/sign-in"
import { FIXED_NOW } from "@/test/clock"

const EMAIL = "founder@example.test"
const PASSWORD = "unit-test-password"
let config: AuthConfig

beforeEach(async () => {
  vi.useFakeTimers({ now: FIXED_NOW })
  config = {
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD, { N: 2 ** 10, r: 8, p: 1 }),
    secret: "x".repeat(32),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

const attempt = (
  limiter: ReturnType<typeof createRateLimiter>,
  email: string,
  password: string,
  ip = "203.0.113.7"
) => attemptSignIn({ email, password, ip, config, limiter })

describe("attemptSignIn", () => {
  it("accepts the right email and password (email is case-insensitive)", async () => {
    const limiter = createRateLimiter()
    expect(await attempt(limiter, "  Founder@Example.TEST ", PASSWORD)).toEqual({
      ok: true,
      email: EMAIL,
    })
  })

  it("gives one message for a wrong password or a wrong email", async () => {
    const limiter = createRateLimiter()
    expect(await attempt(limiter, EMAIL, "nope")).toEqual({ ok: false, error: AUTH_COPY.incorrect })
    expect(await attempt(limiter, "someone@example.test", PASSWORD)).toEqual({
      ok: false,
      error: AUTH_COPY.incorrect,
    })
  })

  it("asks for both fields when one is blank", async () => {
    const limiter = createRateLimiter()
    expect(await attempt(limiter, "", PASSWORD)).toEqual({ ok: false, error: AUTH_COPY.missing })
    expect(await attempt(limiter, EMAIL, "")).toEqual({ ok: false, error: AUTH_COPY.missing })
    expect(limiter.size()).toBe(0)
  })

  it("fails closed when sign-in is not configured", async () => {
    const result = await attemptSignIn({
      email: EMAIL,
      password: PASSWORD,
      ip: "203.0.113.7",
      config: null,
      limiter: createRateLimiter(),
    })
    expect(result).toEqual({ ok: false, error: AUTH_COPY.notConfigured })
  })

  it("locks after five failures, even for the right password, then reopens", async () => {
    const limiter = createRateLimiter()
    for (let i = 1; i < MAX_FAILURES; i++) {
      expect((await attempt(limiter, EMAIL, "nope")).ok).toBe(false)
    }
    expect(await attempt(limiter, EMAIL, "nope")).toEqual({
      ok: false,
      error: "Too many attempts. Try again in 15 minutes.",
    })
    expect(await attempt(limiter, EMAIL, PASSWORD)).toEqual({
      ok: false,
      error: "Too many attempts. Try again in 15 minutes.",
    })

    vi.advanceTimersByTime(WINDOW_MS - 30_000)
    expect(await attempt(limiter, EMAIL, PASSWORD)).toEqual({
      ok: false,
      error: "Too many attempts. Try again in 1 minute.",
    })
    // A different IP is not locked.
    expect((await attempt(limiter, EMAIL, PASSWORD, "198.51.100.1")).ok).toBe(true)

    vi.advanceTimersByTime(30_000)
    expect((await attempt(limiter, EMAIL, PASSWORD)).ok).toBe(true)
  })
})

describe("getAuthConfig", () => {
  const good = {
    ADMIN_EMAIL: " Founder@Example.test ",
    ADMIN_PASSWORD_HASH: "scrypt$1024$8$1$c2FsdA==$aGFzaA==",
    AUTH_SECRET: "s".repeat(32),
  }

  it("reads and normalises a complete config", () => {
    expect(getAuthConfig(good)).toEqual({
      email: "founder@example.test",
      passwordHash: good.ADMIN_PASSWORD_HASH,
      secret: good.AUTH_SECRET,
    })
  })

  it.each([
    ["no email", { ...good, ADMIN_EMAIL: undefined }],
    ["no hash", { ...good, ADMIN_PASSWORD_HASH: "" }],
    ["a plaintext password as the hash", { ...good, ADMIN_PASSWORD_HASH: "hunter2" }],
    ["no secret", { ...good, AUTH_SECRET: undefined }],
    ["a short secret", { ...good, AUTH_SECRET: "s".repeat(31) }],
  ])("returns null with %s", (_label, env) => {
    expect(getAuthConfig(env)).toBeNull()
  })
})
