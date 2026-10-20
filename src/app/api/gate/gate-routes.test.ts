import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST as login } from "@/app/api/gate/login/route"
import { POST as logout } from "@/app/api/gate/logout/route"
import { GATE_COOKIE } from "@/lib/gate/cookie"
import { loginLimiter } from "@/lib/gate/rate-limit"

const EMAIL = "founder@example.test"
const SECRET = "test-only-gate-password-1"
const ORIGIN = "https://dash.example.test"

let ip = 0
function post(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(fields)
  return new Request(`${ORIGIN}/api/gate/login`, {
    method: "POST",
    body,
    headers: { origin: ORIGIN, "x-forwarded-for": `10.0.0.${ip}`, ...headers },
  })
}

beforeEach(() => {
  ip += 1
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.stubEnv("DASHBOARD_LOGIN_EMAIL", EMAIL)
  vi.stubEnv("DASHBOARD_GATE_SECRET", SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("POST /api/gate/login", () => {
  it("sets a secure httpOnly cookie and 303s to next on the right login", async () => {
    const res = await login(post({ email: " Founder@Example.test ", password: SECRET, next: "/crm" }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/crm`)
    const cookie = res.headers.get("set-cookie")!
    expect(cookie).toContain(`${GATE_COOKIE}=v1.`)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Max-Age=604800/)
    expect(cookie).not.toContain(SECRET)
  })

  it.each([
    "//evil.example",
    "/..//evil.example",
    "/%2e%2e//evil.example",
    "/./\\/evil.example",
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "/\t//evil.example",
    "https://evil.example/",
  ])("never redirects off-site, even with a cookie already set (next=%j)", async (next) => {
    const res = await login(
      post({ email: EMAIL, password: SECRET, next }, { cookie: "hotdash_gate=v1.1.junk; other=1" })
    )
    expect(res.status).toBe(303)
    const location = new URL(res.headers.get("location")!)
    expect(location.origin).toBe(ORIGIN)
    expect(location.pathname).toBe("/home")
    expect(res.headers.get("set-cookie")).toContain(`${GATE_COOKIE}=v1.`)
  })

  it("a wrong login with a hostile next keeps it out of the unlock link", async () => {
    const res = await login(post({ email: EMAIL, password: "wrong", next: "/..//evil.example" }))
    const location = new URL(res.headers.get("location")!)
    expect(location.origin).toBe(ORIGIN)
    expect(location.searchParams.get("next")).toBeNull()
  })

  it("gives one generic error for a wrong email or password, with no cookie", async () => {
    for (const fields of [
      { email: EMAIL, password: "wrong" },
      { email: "x@example.test", password: SECRET },
    ]) {
      const res = await login(post({ ...fields, next: "/metrics" }))
      expect(res.status).toBe(303)
      const location = new URL(res.headers.get("location")!)
      expect(location.pathname).toBe("/unlock")
      expect(location.searchParams.get("error")).toBe("invalid")
      expect(location.searchParams.get("next")).toBe("/metrics")
      expect(res.headers.get("set-cookie")).toBeNull()
    }
  })

  it("rate-limits after 5 wrong tries, even with the right password next", async () => {
    loginLimiter.reset(`10.0.0.${ip}`)
    for (let i = 0; i < 5; i++) await login(post({ email: EMAIL, password: "wrong" }))
    const res = await login(post({ email: EMAIL, password: SECRET }))
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("limited")
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("refuses cross-site posts", async () => {
    const res = await login(post({ email: EMAIL, password: SECRET }, { origin: "https://evil.example" }))
    expect(res.status).toBe(403)
  })

  it("refuses when misconfigured", async () => {
    vi.stubEnv("DASHBOARD_GATE_SECRET", "")
    const res = await login(post({ email: EMAIL, password: SECRET }))
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("misconfigured")
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

describe("POST /api/gate/logout", () => {
  it("clears the cookie and goes to /unlock", async () => {
    const res = await logout(new Request(`${ORIGIN}/api/gate/logout`, { method: "POST", headers: { origin: ORIGIN } }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/unlock`)
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${GATE_COOKIE}=;.*Max-Age=0`, "i"))
  })

  it("refuses cross-site", async () => {
    const res = await logout(
      new Request(`${ORIGIN}/api/gate/logout`, { method: "POST", headers: { origin: "https://evil.example" } })
    )
    expect(res.status).toBe(403)
  })
})
