import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session"
import { config, isPublicPath, proxy } from "@/proxy"
import { FIXED_NOW } from "@/test/clock"

const EMAIL = "founder@example.test"
const SECRET = "proxy-test-secret-proxy-test-secret-01"
const ORIGIN = "http://localhost:3001"

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW })
  vi.stubEnv("ADMIN_EMAIL", EMAIL)
  vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt$1024$8$1$c2FsdA==$aGFzaA==")
  vi.stubEnv("AUTH_SECRET", SECRET)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function request(path: string, token?: string) {
  const headers = new Headers()
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`)
  return new NextRequest(new URL(path, ORIGIN), { headers })
}

const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1"

describe("proxy, signed out", () => {
  it.each(["/", "/home", "/crm/cases/abc", "/settings", "/infrastructure"])(
    "redirects the page %s to /sign-in with next",
    async (path) => {
      const res = await proxy(request(path))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get("location")!)
      expect(location.origin).toBe(ORIGIN)
      expect(location.pathname).toBe("/sign-in")
      expect(location.searchParams.get("next")).toBe(path === "/" ? null : path)
    }
  )

  it("keeps the query string in next", async () => {
    const res = await proxy(request("/crm?tab=cases"))
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/crm?tab=cases")
  })

  it.each(["/api/anything", "/api/auth/session", "/api"])("answers %s with 401 JSON", async (path) => {
    const res = await proxy(request(path))
    expect(res.status).toBe(401)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({ error: "Not signed in." })
  })

  it.each(["/sign-in", "/api/auth/sign-out", "/icon.svg", "/robots.txt"])(
    "lets the public path %s through",
    async (path) => {
      expect(passesThrough(await proxy(request(path)))).toBe(true)
    }
  )

  it("does not treat a dotted API or page path as a static file", () => {
    expect(isPublicPath("/api/export.csv")).toBe(false)
    expect(isPublicPath("/api/data.json")).toBe(false)
    expect(isPublicPath("/crm/x.png")).toBe(false)
    expect(isPublicPath("/sign-in/extra")).toBe(false)
  })

  it("rejects a forged, expired or foreign-secret cookie", async () => {
    const expired = await signSession(EMAIL, SECRET, Date.now() - SESSION_TTL_SECONDS * 1000)
    const foreign = await signSession(EMAIL, "another-secret-another-secret-another")
    for (const token of ["garbage", "a.b", expired, foreign]) {
      expect((await proxy(request("/home", token))).status).toBe(307)
      expect((await proxy(request("/api/x", token))).status).toBe(401)
    }
  })
})

describe("proxy, signed in", () => {
  it("lets pages and API routes through", async () => {
    const token = await signSession(EMAIL, SECRET)
    expect(passesThrough(await proxy(request("/home", token)))).toBe(true)
    expect(passesThrough(await proxy(request("/api/anything", token)))).toBe(true)
  })

  it("sends /sign-in to Home", async () => {
    const token = await signSession(EMAIL, SECRET)
    const res = await proxy(request("/sign-in?next=/crm", token))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/home`)
  })

  it("stops accepting the session once it is 7 days old", async () => {
    const token = await signSession(EMAIL, SECRET)
    vi.advanceTimersByTime(SESSION_TTL_SECONDS * 1000)
    expect((await proxy(request("/home", token))).status).toBe(307)
  })
})

describe("proxy, not configured", () => {
  it("fails closed: a cookie signed with the old secret no longer opens anything", async () => {
    const token = await signSession(EMAIL, SECRET)
    vi.stubEnv("AUTH_SECRET", "")
    expect((await proxy(request("/home", token))).status).toBe(307)
    expect((await proxy(request("/api/x", token))).status).toBe(401)
    expect(passesThrough(await proxy(request("/sign-in", token)))).toBe(true)
  })
})

describe("config.matcher", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`)

  it.each(["/", "/home", "/api/x", "/sign-in", "/settings"])("runs on %s", (path) => {
    expect(matcher.test(path)).toBe(true)
  })

  it.each(["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico"])(
    "skips %s",
    (path) => {
      expect(matcher.test(path)).toBe(false)
    }
  )
})
