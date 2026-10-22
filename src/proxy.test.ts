import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GATE_COOKIE, signGateCookie } from "@/lib/gate/cookie"
import {
  config,
  isApiPath,
  isCrmCronRequest,
  isPublicPath,
  proxy,
} from "@/proxy"

const EMAIL = "founder@example.test"
const SECRET = "test-only-gate-password-1"
const ORIGIN = "https://dash.example.test"

function req(path: string, cookie?: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers)
  if (cookie) headers.set("cookie", `${GATE_COOKIE}=${cookie}`)
  return new NextRequest(new URL(path, ORIGIN), { headers, method: init.method })
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

  it("redirects /home without a next (it is the default)", async () => {
    const res = await proxy(req("/home"))
    expect(new URL(res.headers.get("location")!).search).toBe("")
  })

  it.each(["HEAD", "OPTIONS", "POST", "DELETE"])("401s %s on an API", async (method) => {
    expect((await proxy(req("/api/inbox", undefined, { method }))).status).toBe(401)
  })

  it("locks trailing-slash and case variants", async () => {
    expect((await proxy(req("/api/inbox/"))).status).toBe(401)
    expect((await proxy(req("/api/health/stripe/"))).status).toBe(401)
    expect((await proxy(req("/crm/"))).status).toBe(307)
    for (const path of ["/API/inbox", "/Api/Inbox", "/%61pi/inbox", "/UNLOCK/x", "/Unlock"]) {
      const res = await proxy(req(path))
      expect([307, 401], path).toContain(res.status)
    }
  })

  it("a locked deep link carries an encoded path back safely", async () => {
    const res = await proxy(req("/..//evil.example"))
    const location = new URL(res.headers.get("location")!)
    expect(location.origin).toBe(ORIGIN)
    const next = location.searchParams.get("next")
    if (next) expect(new URL(next, ORIGIN).origin).toBe(ORIGIN)
  })

  it.each(["/api/inbox", "/api/stripe/mrr-cash", "/api/stripe/subscribers?list=new", "/api/stripe/subscribers?list=churned", "/api/crm/gmail", "/api/health/stripe", "/api/health/gmail", "/api"])(
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

  it("lets authenticated cron routes perform their own bearer-token check", async () => {
    for (const source of ["gmail", "stripe", "supabase", "all"]) {
      expect(
        passes(await proxy(req(`/api/crm/sync/${source}`, undefined, { method: "GET" })))
      ).toBe(true)
    }
    expect(
      (await proxy(req("/api/crm/sync/gmail", undefined, { method: "POST" }))).status
    ).toBe(401)
    expect((await proxy(req("/api/crm/sync/runs"))).status).toBe(401)
  })
})

describe("proxy, client-sent x-hotdash-bare", () => {
  const forwarded = (res: Response) => res.headers.get("x-middleware-request-x-hotdash-bare")
  const overridden = (res: Response) => res.headers.get("x-middleware-override-headers") ?? ""

  it("is stripped when the gate is off", async () => {
    setGate()
    const res = await proxy(req("/crm", undefined, { headers: { "x-hotdash-bare": "1" } }))
    expect(passes(res)).toBe(true)
    // Next replaces the request headers with this list; the bare one is not in it.
    expect(res.headers.has("x-middleware-override-headers")).toBe(true)
    expect(overridden(res)).not.toContain("x-hotdash-bare")
    expect(forwarded(res)).toBeNull()
  })

  it("is stripped for a signed-in page", async () => {
    setGate(EMAIL, SECRET)
    const cookie = await signGateCookie(EMAIL, SECRET)
    const res = await proxy(req("/crm", cookie, { headers: { "x-hotdash-bare": "1" } }))
    expect(passes(res)).toBe(true)
    expect(res.headers.has("x-middleware-override-headers")).toBe(true)
    expect(overridden(res)).not.toContain("x-hotdash-bare")
    expect(forwarded(res)).toBeNull()
  })

  it("is set by the proxy itself only on /unlock", async () => {
    setGate(EMAIL, SECRET)
    const res = await proxy(req("/unlock"))
    expect(forwarded(res)).toBe("1")
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
    expect(isCrmCronRequest(req("/api/crm/sync/gmail"))).toBe(true)
    expect(isCrmCronRequest(req("/api/crm/sync/runs"))).toBe(false)
  })

  it("keeps every CRM page and the CRM's API private", async () => {
    const paths = [
      "/crm",
      "/crm/",
      "/crm/cases",
      "/crm/cases/case-1",
      "/crm/cases?case=case-1",
      "/crm/accounts",
      "/crm/accounts/x",
      "/crm/contacts",
      "/crm/triage",
      "/api/crm/gmail",
    ]
    for (const path of paths) expect(isPublicPath(path), path).toBe(false)
    setGate(EMAIL, SECRET)
    for (const path of paths) {
      const res = await proxy(req(path))
      expect(passes(res), path).toBe(false)
      expect(res.status, path).toBe(path.startsWith("/api/") ? 401 : 307)
    }
  })

  it("reuses #38's matcher", () => {
    expect(config.matcher).toEqual(["/((?!_next/|favicon\\.ico).*)"])
  })
})
