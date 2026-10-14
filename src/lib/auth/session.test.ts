import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/session"
import { FIXED_NOW } from "@/test/clock"

const SECRET = "unit-test-secret-unit-test-secret-0123"
const EMAIL = "founder@example.test"

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Flip one base64url character so the bytes change but the format holds. */
function flip(text: string, index: number) {
  const c = text[index]
  return text.slice(0, index) + (c === "A" ? "B" : "A") + text.slice(index + 1)
}

describe("signSession / verifySession", () => {
  it("round-trips a fresh session", async () => {
    const token = await signSession(EMAIL, SECRET)
    const session = await verifySession(token, SECRET, EMAIL)
    expect(session).toEqual({
      sub: EMAIL,
      iat: FIXED_NOW.getTime() / 1000,
      exp: FIXED_NOW.getTime() / 1000 + SESSION_TTL_SECONDS,
    })
  })

  it("rejects a tampered payload", async () => {
    const token = await signSession(EMAIL, SECRET)
    const [payload, signature] = token.split(".")
    expect(await verifySession(`${flip(payload, 3)}.${signature}`, SECRET, EMAIL)).toBeNull()
  })

  it("rejects a payload swapped for a forged one with the old signature", async () => {
    const token = await signSession(EMAIL, SECRET)
    const signature = token.split(".")[1]
    const forged = btoa(JSON.stringify({ sub: EMAIL, iat: 0, exp: 9_999_999_999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(await verifySession(`${forged}.${signature}`, SECRET, EMAIL)).toBeNull()
  })

  it("rejects a tampered signature", async () => {
    const token = await signSession(EMAIL, SECRET)
    const [payload, signature] = token.split(".")
    expect(await verifySession(`${payload}.${flip(signature, 5)}`, SECRET, EMAIL)).toBeNull()
  })

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(EMAIL, `${SECRET}-other`)
    expect(await verifySession(token, SECRET, EMAIL)).toBeNull()
  })

  it("rejects a session for a different email (ADMIN_EMAIL changed)", async () => {
    const token = await signSession("someone@example.test", SECRET)
    expect(await verifySession(token, SECRET, EMAIL)).toBeNull()
  })

  it("is valid until just before 7 days, and expired at 7 days", async () => {
    const token = await signSession(EMAIL, SECRET)
    vi.advanceTimersByTime(SESSION_TTL_SECONDS * 1000 - 1000)
    expect(await verifySession(token, SECRET, EMAIL)).not.toBeNull()
    vi.advanceTimersByTime(1000)
    expect(await verifySession(token, SECRET, EMAIL)).toBeNull()
  })

  it("rejects a token issued in the future", async () => {
    const token = await signSession(EMAIL, SECRET, Date.now() + 10 * 60 * 1000)
    expect(await verifySession(token, SECRET, EMAIL)).toBeNull()
  })

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["no dot", "abc"],
    ["three parts", "a.b.c"],
    ["not base64url", "a+b.c/d"],
    ["huge", "a".repeat(5000)],
  ])("rejects a %s token without throwing", async (_label, token) => {
    expect(await verifySession(token, SECRET, EMAIL)).toBeNull()
  })
})

describe("sessionCookieOptions", () => {
  it("is httpOnly, Lax, site-wide and lasts 7 days", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    })
  })

  it("is Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(sessionCookieOptions().secure).toBe(true)
    vi.stubEnv("NODE_ENV", "development")
    expect(sessionCookieOptions().secure).toBe(false)
  })
})
