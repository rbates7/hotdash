import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GATE_COOKIE, signGateCookie } from "@/lib/gate/cookie"
import { config, isApiPath, isPublicPath, proxy } from "@/proxy"

const EMAIL = "founder@example.test"
const SECRET = "test-only-gate-password-1"
const ORIGIN = "https://dash.example.test"

function req(path: string, cookie?: string) {
  const headers = new Headers()
  if (cookie) headers.set("cookie", `${GATE_COOKIE}=${cookie}`)
  return new NextRequest(new URL(path, ORIGIN), { headers })
}

function setGate(email?: string, secret?: string) {
  vi.stubEnv("DASHBOARD_LOGIN_EMAIL", email ?? "")
  vi.stubEnv("DASHBOARD_GATE_SECRET", secret ?? "")
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1"

describe("proxy, gate off", () => {
  it("lets every page and API through when neither setting is set", async () => {
    setGate()
    for (const path of ["/", "/crm", "/api/inbox", "/api/health/stripe"]) {
      expect(passes(await proxy(req(path)))).toBe(true)
    }
  })
})

describe("proxy, gate on", () => {
  beforeEach(() => setGate(EMAIL, SECRET))

  it("307s a page to /unlock with a safe next", async () => {
    const res = await proxy(req("/crm/contacts?tab=all"))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location")!)
    expect(location.origin).toBe(ORIGIN)
    expect(location.pathname).toBe("/unlock")
    expect(location.searchParams.get("next")).toBe("/crm/contacts?tab=all")
  })

  it("redirects / without a next", async () => {
    const res = await proxy(req("/"))
    expect(new URL(res.headers.get("location")!).search).toBe("")
  })

  it.each(["/api/inbox", "/api/stripe/mrr-cash", "/api/crm/gmail", "/api/health/stripe", "/api/health/gmail", "/api"])(
    "401s %s with JSON",
    async (path) => {
      const res = await proxy(req(path))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: expect.any(String) })
    }
  )

  it("lets a valid cookie through", async () => {
    const cookie = await signGateCookie(EMAIL, SECRET)
    expect(passes(await proxy(req("/metrics", cookie)))).toBe(true)
    expect(passes(await proxy(req("/api/inbox", cookie)))).toBe(true)
  })

  it("rejects a cookie signed with an old secret", async () => {
    const cookie = await signGateCookie(EMAIL, "old-secret")
    expect((await proxy(req("/api/inbox", cookie))).status).toBe(401)
  })

  it("keeps /unlock, the login/logout routes and static files open", async () => {
    for (const path of ["/unlock", "/api/gate/login", "/api/gate/logout", "/icon.svg"]) {
      expect(passes(await proxy(req(path)))).toBe(true)
    }
  })
})

describe("proxy, misconfigured (one setting)", () => {
  it.each([
    [EMAIL, undefined],
    [undefined, SECRET],
  ])("locks everything, even with a cookie (email=%s)", async (email, secret) => {
    setGate(email, secret)
    const cookie = await signGateCookie(EMAIL, SECRET)
    expect((await proxy(req("/api/inbox", cookie))).status).toBe(401)
    expect((await proxy(req("/home", cookie))).status).toBe(307)
    expect(passes(await proxy(req("/unlock")))).toBe(true)
  })
})

describe("paths and matcher", () => {
  it("classifies paths", () => {
    expect(isApiPath("/api/x")).toBe(true)
    expect(isApiPath("/apix")).toBe(false)
    expect(isPublicPath("/unlock")).toBe(true)
    expect(isPublicPath("/unlock/x")).toBe(false)
    expect(isPublicPath("/crm")).toBe(false)
  })

  it("reuses #38's matcher", () => {
    expect(config.matcher).toEqual(["/((?!_next/|favicon\\.ico).*)"])
  })
})
