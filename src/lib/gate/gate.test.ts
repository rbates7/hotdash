import { afterEach, describe, expect, it, vi } from "vitest"

import { getGateConfig, normalizeEmail } from "@/lib/gate/config"
import { COOKIE_VERSION, GATE_TTL_SECONDS, gateCookieOptions, signGateCookie, verifyGateCookie } from "@/lib/gate/cookie"
import { credentialsMatch, timingSafeEqualText } from "@/lib/gate/credentials"
import { createRateLimiter, clientKey } from "@/lib/gate/rate-limit"
import { safeNext } from "@/lib/gate/safe-next"

const EMAIL = "founder@example.test"
const SECRET = "test-only-gate-password-1"
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0)

afterEach(() => vi.restoreAllMocks())

describe("getGateConfig", () => {
  it("is off when neither setting is set (or both are blank)", () => {
    expect(getGateConfig({})).toEqual({ mode: "off" })
    expect(getGateConfig({ DASHBOARD_LOGIN_EMAIL: " ", DASHBOARD_GATE_SECRET: "  " })).toEqual({ mode: "off" })
  })

  it("is on with both, email normalized and secret kept exact", () => {
    expect(getGateConfig({ DASHBOARD_LOGIN_EMAIL: "  Founder@Example.TEST ", DASHBOARD_GATE_SECRET: " pw " })).toEqual({
      mode: "on",
      email: EMAIL,
      secret: " pw ",
    })
  })

  it("fails closed with only one setting, naming the missing one and never logging a value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const a = getGateConfig({ DASHBOARD_GATE_SECRET: SECRET })
    const b = getGateConfig({ DASHBOARD_LOGIN_EMAIL: EMAIL })
    expect(a).toEqual({ mode: "misconfigured", missing: "DASHBOARD_LOGIN_EMAIL" })
    expect(b).toEqual({ mode: "misconfigured", missing: "DASHBOARD_GATE_SECRET" })
    for (const call of warn.mock.calls) {
      expect(call.join(" ")).not.toContain(SECRET)
      expect(call.join(" ")).not.toContain(EMAIL)
    }
  })

  it("normalizeEmail trims and lower-cases", () => {
    expect(normalizeEmail("  A@B.Co ")).toBe("a@b.co")
  })
})

describe("gate cookie", () => {
  it("round-trips for 7 days and carries the version", async () => {
    const token = await signGateCookie(EMAIL, SECRET, NOW)
    expect(token.startsWith(`${COOKIE_VERSION}.`)).toBe(true)
    expect(token).not.toContain(SECRET)
    expect(await verifyGateCookie(token, EMAIL, SECRET, NOW)).toBe(true)
    expect(await verifyGateCookie(token, EMAIL, SECRET, NOW + (GATE_TTL_SECONDS - 1) * 1000)).toBe(true)
    expect(await verifyGateCookie(token, EMAIL, SECRET, NOW + GATE_TTL_SECONDS * 1000)).toBe(false)
  })

  it("is invalidated by a new secret, another email, an old version or tampering", async () => {
    const token = await signGateCookie(EMAIL, SECRET, NOW)
    expect(await verifyGateCookie(token, EMAIL, "rotated-secret", NOW)).toBe(false)
    expect(await verifyGateCookie(token, "other@example.test", SECRET, NOW)).toBe(false)
    expect(await verifyGateCookie(token.replace(/^v1\./, "v0."), EMAIL, SECRET, NOW)).toBe(false)
    const [v, exp, mac] = token.split(".")
    expect(await verifyGateCookie(`${v}.${Number(exp) + 60}.${mac}`, EMAIL, SECRET, NOW)).toBe(false)
    expect(await verifyGateCookie(`${v}.${exp}.${mac.slice(0, -2)}AA`, EMAIL, SECRET, NOW)).toBe(false)
  })

  it("rejects junk without throwing", async () => {
    for (const junk of [undefined, "", "x", "v1..", "v1.abc.def", "v1.1.!!", "a".repeat(5000)]) {
      expect(await verifyGateCookie(junk, EMAIL, SECRET, NOW)).toBe(false)
    }
  })

  it("rejects an expiry beyond the TTL (never issued by us)", async () => {
    const far = await signGateCookie(EMAIL, SECRET, NOW + 30 * 86_400_000)
    expect(await verifyGateCookie(far, EMAIL, SECRET, NOW)).toBe(false)
  })

  it("cookie options are httpOnly, Secure, SameSite=Lax, 7 days", () => {
    expect(gateCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 604800 })
  })
})

describe("credentials", () => {
  const expected = { email: EMAIL, secret: SECRET }

  it("matches email case-insensitively and trimmed; password exactly", async () => {
    expect(await credentialsMatch({ email: " FOUNDER@example.test ", password: SECRET }, expected)).toBe(true)
    expect(await credentialsMatch({ email: EMAIL, password: SECRET.toUpperCase() }, expected)).toBe(false)
    expect(await credentialsMatch({ email: EMAIL, password: ` ${SECRET}` }, expected)).toBe(false)
    expect(await credentialsMatch({ email: "x@example.test", password: SECRET }, expected)).toBe(false)
    expect(await credentialsMatch({ email: "", password: "" }, expected)).toBe(false)
  })

  it("timingSafeEqualText handles different lengths", async () => {
    expect(await timingSafeEqualText("a", "a")).toBe(true)
    expect(await timingSafeEqualText("a", "ab")).toBe(false)
  })
})

describe("safeNext (B1: same-origin paths only, fallback /home)", () => {
  const ORIGIN = "https://dash.example.test"
  it.each([
    // kept
    ["/crm?tab=cases", "/crm?tab=cases"],
    ["/metrics#mrr", "/metrics#mrr"],
    ["/crm/../metrics", "/metrics"],
    ["/./crm", "/crm"],
    ["/", "/"],
    // off-site or host-like
    ["https://evil.example", "/home"],
    ["//evil.example", "/home"],
    ["///evil.example", "/home"],
    ["/..//evil.example", "/home"],
    ["/../..//evil.example", "/home"],
    ["/./..//evil.example", "/home"],
    ["/x/../..//evil.example", "/home"],
    ["/%2e%2e//evil.example", "/home"],
    ["/%2E%2E//evil.example", "/home"],
    ["/.%2e//evil.example", "/home"],
    ["/%2F%2Fevil.example", "/home"],
    ["/%2f/evil.example", "/home"],
    ["/%5Cevil.example", "/home"],
    ["/%5c%5cevil.example", "/home"],
    ["/\\evil.example", "/home"],
    ["/\\/evil.example", "/home"],
    ["/./\\/evil.example", "/home"],
    ["/crm\\x", "/home"],
    ["\\\\evil.example", "/home"],
    ["/\tfoo", "/home"],
    ["/\t/evil.example", "/home"],
    ["/\n/evil.example", "/home"],
    ["/\r\n//evil.example", "/home"],
    ["/%E0%A4%A", "/home"],
    ["crm", "/home"],
    ["javascript:alert(1)", "/home"],
    // the gate itself (no loop)
    ["/unlock", "/home"],
    ["/UNLOCK", "/home"],
    ["/unlock?next=/x", "/home"],
    ["/api/gate/login", "/home"],
    [undefined, "/home"],
    ["", "/home"],
  ])("%j → %s", (input, out) => {
    expect(safeNext(input, ORIGIN)).toBe(out)
    expect(safeNext(input)).toBe(out)
  })

  it("every kept result resolves to the request origin", () => {
    for (const input of ["/crm", "/a/../b", "/%2e/x", "/x?y=//evil.example", "/x#//evil.example"]) {
      expect(new URL(safeNext(input, ORIGIN), ORIGIN).origin).toBe(ORIGIN)
    }
  })
})

describe("rate limiter", () => {
  it("stays locked through the window: 6th, 10th attempt refused, retry time shrinks", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 5; i++) limiter.fail("ip", NOW)
    const first = limiter.check("ip", NOW + 60_000)
    const later = limiter.check("ip", NOW + 10 * 60_000)
    expect(first.allowed).toBe(false)
    expect(later.allowed).toBe(false)
    if (!first.allowed && !later.allowed) expect(later.retryAfterMs).toBeLessThan(first.retryAfterMs)
    for (let i = 0; i < 5; i++) expect(limiter.fail("ip", NOW + 1000 + i).allowed).toBe(false)
  })

  it("locks after 5 failures in 15 minutes, then frees", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 4; i++) expect(limiter.fail("ip", NOW + i).allowed).toBe(true)
    expect(limiter.fail("ip", NOW + 5).allowed).toBe(false)
    expect(limiter.check("other", NOW).allowed).toBe(true)
    expect(limiter.check("ip", NOW + 15 * 60_000 + 1).allowed).toBe(true)
  })

  it("reset clears a key", () => {
    const limiter = createRateLimiter({ maxFailures: 1 })
    limiter.fail("ip", NOW)
    limiter.reset("ip")
    expect(limiter.check("ip", NOW).allowed).toBe(true)
  })

  it("clientKey uses the first forwarded hop", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4")
    expect(clientKey(new Headers())).toBe("unknown")
  })
})
