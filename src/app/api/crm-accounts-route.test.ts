// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GATE_COOKIE, signGateCookie } from "@/lib/gate/cookie"
import { emptyAccounts } from "@/lib/crm/accounts/model"

const service = vi.hoisted(() => ({ read: vi.fn(), detail: vi.fn(), settled: vi.fn(async () => {}) }))
vi.mock("@/lib/server/stripe-accounts", () => ({ accountsService: service }))
const after = vi.hoisted(() => vi.fn())
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }))

const { GET } = await import("@/app/api/crm/accounts/route")
const { GET: GET_ONE } = await import("@/app/api/crm/accounts/[orgId]/route")
const { proxy, isCrmCronRequest, isPublicPath } = await import("@/proxy")

const EMAIL = "founder@example.test"
const SECRET = "test-only-gate-password-1"
const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie: `${GATE_COOKIE}=${cookie}` } } : undefined)
const params = (orgId: string) => ({ params: Promise.resolve({ orgId }) })

beforeEach(() => {
  service.read.mockReset()
  service.detail.mockReset()
  after.mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("auth gating", () => {
  it.each(["/api/crm/accounts", "/api/crm/accounts/org-1", "/crm/accounts", "/crm/accounts/org-1"])("%s is locked by the sign-in gate", async (path) => {
    vi.stubEnv("DASHBOARD_LOGIN_EMAIL", EMAIL)
    vi.stubEnv("DASHBOARD_GATE_SECRET", SECRET)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(isPublicPath(path)).toBe(false)
    expect(isCrmCronRequest(req(path))).toBe(false)
    const out = await proxy(req(path))
    if (path.startsWith("/api/")) {
      expect(out.status).toBe(401)
    } else {
      expect(out.status).toBe(307)
      expect(out.headers.get("location")).toContain("/unlock")
    }
    const cookie = await signGateCookie(EMAIL, SECRET)
    expect((await proxy(req(path, cookie))).headers.get("x-middleware-next")).toBe("1")
  })
})

describe("GET /api/crm/accounts", () => {
  it("answers the service's body, never cached, keeping the read alive after the response", async () => {
    service.read.mockResolvedValue(emptyAccounts("connecting"))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toMatchObject({ status: "connecting", orgs: [] })
    expect(after).toHaveBeenCalledTimes(1)
  })

  it("an unexpected throw is not_connected, never the error", async () => {
    service.read.mockRejectedValue(new Error("rk_live_secret coach@example.test"))
    const res = await GET()
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(JSON.parse(text)).toMatchObject({ status: "not_connected", orgs: [], noOrgUsers: [] })
    expect(text).not.toContain("rk_live")
    expect(text).not.toContain("coach@")
  })
})

describe("GET /api/crm/accounts/[orgId]", () => {
  it("one org from the service", async () => {
    service.detail.mockResolvedValue({ status: "connected", missing: [], lastSyncedAt: null, lastTriedAt: null, org: { id: "org-1" } })
    const res = await GET_ONE(req("/api/crm/accounts/org-1"), params("org-1"))
    expect(res.status).toBe(200)
    expect(service.detail).toHaveBeenCalledWith("org-1")
  })

  it("404 only when connected and there is no such org", async () => {
    service.detail.mockResolvedValue({ status: "connected", missing: [], lastSyncedAt: null, lastTriedAt: null, org: null })
    expect((await GET_ONE(req("/api/crm/accounts/x"), params("x"))).status).toBe(404)
    service.detail.mockResolvedValue({ status: "not_connected", missing: ["stripe"], lastSyncedAt: null, lastTriedAt: null, org: null })
    const res = await GET_ONE(req("/api/crm/accounts/x"), params("x"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "not_connected", missing: ["stripe"] })
  })

  it("a throw is not_connected", async () => {
    service.detail.mockRejectedValue(new Error("boom"))
    const res = await GET_ONE(req("/api/crm/accounts/x"), params("x"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "not_connected", org: null })
  })
})
