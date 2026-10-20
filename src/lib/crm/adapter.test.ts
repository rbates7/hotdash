import { describe, expect, it } from "vitest"

import { isCrmActivity, isCrmMessage, parseCrmSummary, toCrmThread } from "@/lib/crm/adapter"
import { CRM_CONNECTING, CRM_NOT_CONNECTED } from "@/lib/crm/case-view"
import {
  crmFixtureSummary,
  crmFixtureThread,
  crmFixtureThreadBody,
  crmNotConnectedBody,
  HOSTILE_TEXT,
} from "@/test/crm-fixture"

const NOW = Date.parse("2026-10-19T15:00:00Z")
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v))

describe("parseCrmSummary: Hill's CrmListResponse", () => {
  it("passes a well-formed body through unchanged", () => {
    const body = crmFixtureSummary(NOW)
    expect(parseCrmSummary(json(body))).toEqual(body)
  })

  it("ignores the route's older fields (lastSyncedAt, mailbox, data)", () => {
    const body = crmFixtureSummary(NOW)
    const out = parseCrmSummary({ ...json(body), lastSyncedAt: body.lastUpdated, mailbox: "support@example.com", data: { cases: [] } })
    expect(out).toEqual(body)
    expect(out).not.toHaveProperty("data")
  })

  it("drops a malformed row and keeps the rest", () => {
    const body = json(crmFixtureSummary(NOW))
    const raw = {
      ...body,
      cases: [...body.cases, { id: "case-9", subject: 3 }],
      accounts: [...body.accounts, { id: "org-9", name: "x", domain: null }],
      recentActivity: [...body.recentActivity, { id: "act-9", kind: "received", summary: "old shape" }],
    }
    const out = parseCrmSummary(raw)!
    expect(out.cases.map((c) => c.id)).toEqual(body.cases.map((c) => c.id))
    expect(out.accounts).toHaveLength(1)
    expect(out.recentActivity).toHaveLength(2)
  })

  it("keeps a case with no account (personal domain)", () => {
    const out = parseCrmSummary(json(crmFixtureSummary(NOW)))!
    expect(out.cases.find((c) => c.id === "case-4")?.accountId).toBeNull()
  })

  it("not connected / connecting: no rows, whatever came, and the zero counts are only a placeholder", () => {
    expect(parseCrmSummary(json(crmNotConnectedBody()))).toEqual(CRM_NOT_CONNECTED)
    expect(parseCrmSummary({ ...crmNotConnectedBody(), status: "connecting" })).toEqual(CRM_CONNECTING)
    expect(CRM_NOT_CONNECTED.counts).toEqual({ open: 0, waitingOnUs: 0, waitingOnThem: 0, closedThisWeek: 0 })
  })

  it("an unreadable body is null (a failed read)", () => {
    expect(parseCrmSummary(null)).toBeNull()
    expect(parseCrmSummary({ status: "connected", lastUpdated: null, cases: [] })).toBeNull()
    expect(parseCrmSummary({ status: "weird" })).toBeNull()
    // develop's old GmailSummary alone is not read any more.
    expect(parseCrmSummary({ status: "connected", lastSyncedAt: new Date(NOW).toISOString(), mailbox: "a@example.com", data: {} })).toBeNull()
  })
})

describe("isCrmActivity", () => {
  it("reads {type, caseId, at, actor}; status_changed is optional but accepted", () => {
    const at = new Date(NOW).toISOString()
    const actor = { name: null, email: "support@example.com" }
    expect(isCrmActivity({ type: "sent", caseId: "case-1", at, actor })).toBe(true)
    expect(isCrmActivity({ type: "status_changed", caseId: "case-1", at, actor })).toBe(true)
    expect(isCrmActivity({ id: "a", kind: "sent", caseId: "case-1", at, summary: "x" })).toBe(false)
  })
})

describe("toCrmThread: Hill's CrmThreadResponse", () => {
  it("reads the messages oldest first", () => {
    const body = json(crmFixtureThreadBody(NOW))
    const out = toCrmThread({ ...body, messages: [...body.messages].reverse() })!
    expect(out).toEqual(crmFixtureThread(NOW))
  })

  it("to / cc are people, and bodyText is plain text kept as is", () => {
    const [first] = toCrmThread(json(crmFixtureThreadBody(NOW)))!
    expect(first!.to).toEqual([{ name: null, email: "support@example.com" }])
    expect(first!.bodyText).toContain(HOSTILE_TEXT)
  })

  it("never keeps an HTML body, even if one came", () => {
    const body = json(crmFixtureThreadBody(NOW))
    const raw = { ...body, messages: body.messages.map((m) => ({ ...m, bodyHtml: "<b>x</b>" })) }
    for (const m of toCrmThread(raw)!) expect(Object.keys(m)).not.toContain("bodyHtml")
  })

  it("drops a message in an old shape (string recipients, null body)", () => {
    const [good] = json(crmFixtureThread(NOW))
    expect(isCrmMessage(good)).toBe(true)
    expect(isCrmMessage({ ...good, to: ["a@example.com"] })).toBe(false)
    expect(isCrmMessage({ ...good, bodyText: null })).toBe(false)
    expect(isCrmMessage({ ...good, threadId: undefined })).toBe(false)
  })

  it("not connected is an empty thread; an unreadable body is null", () => {
    expect(toCrmThread({ status: "not_connected", lastUpdated: null, caseId: "case-1", messages: [] })).toEqual([])
    expect(toCrmThread({ error: "not_found" })).toBeNull()
  })
})
