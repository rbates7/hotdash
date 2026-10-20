import { afterEach, describe, expect, it, vi } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { crmFixtureSummary, crmFixtureThread, crmFixtureThreadBody, crmNotConnectedBody } from "@/test/crm-fixture"
import { liveGmailSummary } from "@/test/gmail-fixture"
import { CRM_NOT_CONNECTED, CRM_CONNECTING } from "@/lib/crm/case-view"
import { crmReducer, fetchCrmSummary, fetchCrmThread, type CrmView } from "@/hooks/use-crm-summary"

const LIVE = crmFixtureSummary(FIXED_NOW_MS)

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

afterEach(() => vi.unstubAllGlobals())

describe("fetchCrmSummary", () => {
  it("401 is unauthorized, never not connected", async () => {
    stubFetch(401, { error: "Locked. Sign in at /unlock." })
    expect(await fetchCrmSummary()).toEqual({ kind: "unauthorized" })
  })

  it("reads Hill's CrmListResponse, ignoring the route's older fields", async () => {
    stubFetch(200, LIVE)
    expect(await fetchCrmSummary()).toEqual({ kind: "ok", data: LIVE })
    stubFetch(200, { ...liveGmailSummary(FIXED_NOW_MS), ...LIVE })
    expect(await fetchCrmSummary()).toEqual({ kind: "ok", data: LIVE })
  })

  it("not connected: the route's zero counts come with it, as status not_connected", async () => {
    stubFetch(200, crmNotConnectedBody())
    expect(await fetchCrmSummary()).toEqual({ kind: "ok", data: CRM_NOT_CONNECTED })
  })

  it("a 500, an unreadable body or a network failure is an error", async () => {
    stubFetch(500, {})
    expect(await fetchCrmSummary()).toEqual({ kind: "error" })
    stubFetch(200, { hello: "world" })
    expect(await fetchCrmSummary()).toEqual({ kind: "error" })
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
    expect(await fetchCrmSummary()).toEqual({ kind: "error" })
  })
})

describe("fetchCrmThread", () => {
  it("asks for the case and maps 401", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await fetchCrmThread("case 1")).toEqual({ kind: "unauthorized" })
    expect(fetchMock).toHaveBeenCalledWith("/api/crm/gmail?caseId=case%201", { cache: "no-store" })
  })

  it("reads a CrmThreadResponse", async () => {
    stubFetch(200, crmFixtureThreadBody(FIXED_NOW_MS))
    expect(await fetchCrmThread("case-1")).toEqual({ kind: "ok", data: crmFixtureThread(FIXED_NOW_MS) })
  })

  it("400 (bad id) and 404 (unknown case) are not found", async () => {
    stubFetch(400, { error: "bad_case_id" })
    expect(await fetchCrmThread("nope")).toEqual({ kind: "not_found" })
    stubFetch(404, { error: "not_found" })
    expect(await fetchCrmThread("case-99")).toEqual({ kind: "not_found" })
    stubFetch(500, {})
    expect(await fetchCrmThread("case-1")).toEqual({ kind: "error" })
  })
})

describe("crmReducer", () => {
  const ready = (summary = LIVE): CrmView => ({ phase: "ready", summary })

  it("an answer replaces the view; 401 is unauthorized", () => {
    expect(crmReducer({ phase: "loading" }, { kind: "ok", data: LIVE })).toEqual(ready())
    expect(crmReducer(ready(), { kind: "unauthorized" })).toEqual({ phase: "unauthorized" })
  })

  it("a failure keeps the last rows as stale", () => {
    const next = crmReducer(ready(), { kind: "error" })
    expect(next.phase === "ready" && next.summary).toEqual({ ...LIVE, status: "stale" })
  })

  it("a failure with no rows yet (or while connecting) reads as not connected", () => {
    expect(crmReducer({ phase: "loading" }, { kind: "error" })).toEqual(ready(CRM_NOT_CONNECTED))
    expect(crmReducer(ready(CRM_CONNECTING), { kind: "error" })).toEqual(ready(CRM_NOT_CONNECTED))
  })
})
