import { describe, expect, it } from "vitest"

import { FIXED_NOW_MS } from "@/test/clock"
import { crmFixtureSummary, crmFixtureThread } from "@/test/crm-fixture"
import { liveGmailSummary } from "@/test/gmail-fixture"
import {
  groupAccounts,
  mapLegacyStatus,
  parseCrmSummary,
  toCrmSummary,
  toCrmThread,
} from "@/lib/crm/adapter"
import { gmailConnecting, gmailNotConnected } from "@/lib/crm/gmail-summary"
import { CRM_NOT_CONNECTED, isWaitingOnUs, type CrmCase } from "@/lib/crm/types.ours"

const NOW = FIXED_NOW_MS
const LEGACY = liveGmailSummary(NOW)
const json = <T>(v: T): unknown => JSON.parse(JSON.stringify(v))

describe("toCrmSummary: Hill's new shape", () => {
  it("passes a valid body through unchanged", () => {
    const body = crmFixtureSummary(NOW)
    expect(toCrmSummary(json(body), NOW)).toEqual(body)
  })

  it("drops a malformed row and keeps the rest", () => {
    const body = crmFixtureSummary(NOW)
    const raw = json(body) as { cases: unknown[] }
    raw.cases.push({ id: "bad", status: "new" })
    const out = toCrmSummary(raw, NOW)
    expect(out.cases).toHaveLength(body.cases.length)
  })

  it("connecting and not_connected carry no rows and no counts", () => {
    for (const status of ["connecting", "not_connected"] as const) {
      const out = toCrmSummary({ status, lastUpdated: null, cases: [], counts: null }, NOW)
      expect(out).toEqual({ status, lastUpdated: null, cases: [], accounts: [], recentActivity: [], counts: null })
    }
  })

  it("an unreadable body is null from parse, not connected from toCrmSummary", () => {
    expect(parseCrmSummary({ status: "connected", cases: [], counts: { open: -1 } }, NOW)).toBeNull()
    expect(parseCrmSummary("nope", NOW)).toBeNull()
    expect(toCrmSummary(null, NOW)).toEqual(CRM_NOT_CONNECTED)
  })
})

describe("toCrmSummary: today's GmailSummary", () => {
  const out = toCrmSummary(json(LEGACY), NOW)

  it("maps status, lastSyncedAt and every case", () => {
    expect(out.status).toBe("connected")
    expect(out.lastUpdated).toBe(LEGACY.lastSyncedAt)
    expect(out.cases.map((c) => c.id).sort()).toEqual(LEGACY.data.cases.map((c) => c.id).sort())
  })

  it("fills each case from its contact, organization and thread", () => {
    const roster = out.cases.find((c) => c.subject === "Roster import fails on a CSV with accents")!
    const legacy = LEGACY.data.cases.find((c) => c.id === roster.id)!
    const contact = LEGACY.data.contacts.find((c) => c.id === legacy.contactId)!
    const thread = LEGACY.data.messages.filter((m) => m.caseId === roster.id)
    expect(roster.contact).toEqual({ name: "Dana Ortiz", email: contact.email })
    expect(roster.accountId).toBe(contact.organizationId)
    expect(roster.messageCount).toBe(thread.length)
    expect(roster.threadId).toBe(thread[0]!.threadId)
    expect(roster.priority).toBe("high")
    // Dana wrote last: open, and the ball is ours since her last message.
    expect(roster.status).toBe("open")
    expect(roster.waitingOnUsSince).toBe(legacy.lastInboundAt)
    expect(isWaitingOnUs(roster)).toBe(true)
  })

  it("orders cases newest first", () => {
    const times = out.cases.map((c) => Date.parse(c.lastMessageAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("new/open → open; waiting → waiting on them unless they wrote last; closed → closed", () => {
    const at = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
    expect(mapLegacyStatus({ status: "new", lastInboundAt: at(1), lastOutboundAt: null })).toBe("open")
    expect(mapLegacyStatus({ status: "open", lastInboundAt: at(1), lastOutboundAt: at(2) })).toBe("open")
    expect(mapLegacyStatus({ status: "waiting", lastInboundAt: at(2), lastOutboundAt: at(1) })).toBe("waiting_on_them")
    expect(mapLegacyStatus({ status: "waiting", lastInboundAt: at(1), lastOutboundAt: at(2) })).toBe("waiting_on_us")
    expect(mapLegacyStatus({ status: "closed", lastInboundAt: at(1), lastOutboundAt: null })).toBe("closed")
  })

  it("computes the counts from the rows", () => {
    expect(out.counts).toEqual({
      open: out.cases.filter((c) => c.status !== "closed").length,
      waitingOnUs: out.cases.filter(isWaitingOnUs).length,
      waitingOnThem: out.cases.filter((c) => c.status === "waiting_on_them").length,
      // The fixture's one closed case closed nine days ago.
      closedThisWeek: 0,
    })
  })

  it("builds accounts from organizations and recent activity from case messages only", () => {
    expect(out.accounts.map((a) => a.id).sort()).toEqual(LEGACY.data.organizations.map((o) => o.id).sort())
    const caseMessages = LEGACY.data.messages.filter((m) => m.caseId !== null)
    expect(out.recentActivity).toHaveLength(Math.min(20, caseMessages.length))
    expect(out.recentActivity.every((a) => a.kind === "received" || a.kind === "sent")).toBe(true)
    const times = out.recentActivity.map((a) => Date.parse(a.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    // Triage senders never show as activity.
    expect(out.recentActivity.some((a) => a.summary.includes("Sam Patel"))).toBe(false)
  })

  it("connecting and not_connected map to empty summaries", () => {
    expect(toCrmSummary(json(gmailConnecting()), NOW).status).toBe("connecting")
    expect(toCrmSummary(json(gmailNotConnected()), NOW)).toEqual(CRM_NOT_CONNECTED)
  })
})

describe("groupAccounts", () => {
  const c = (id: string, accountId: string | null, status: CrmCase["status"], at: string, since: string | null = null): CrmCase => ({
    id,
    threadId: id,
    subject: id,
    accountId,
    contact: { name: null, email: `${id}@example.com` },
    status,
    priority: "normal",
    waitingOnUsSince: since,
    lastMessageAt: at,
    lastMessageSnippet: "",
    messageCount: 1,
    unread: false,
    labels: [],
  })

  it("counts each organization's open and waiting cases and finds its newest message", () => {
    const orgs = [
      { id: "org-1", name: "Example One", domain: "one.example.com" },
      { id: "org-2", name: "Example Two", domain: null },
    ]
    const people = [
      { organizationId: "org-1", person: { name: "Test A", email: "a@one.example.com" } },
      { organizationId: null, person: { name: null, email: "loner@example.com" } },
    ]
    const cases = [
      c("1", "org-1", "open", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"),
      c("2", "org-1", "closed", "2026-10-05T00:00:00.000Z"),
      c("3", "org-1", "waiting_on_them", "2026-10-03T00:00:00.000Z"),
      c("4", null, "open", "2026-10-09T00:00:00.000Z"),
    ]
    const [one, two] = groupAccounts(orgs, people, cases)
    expect(one).toEqual({
      id: "org-1",
      name: "Example One",
      domain: "one.example.com",
      contacts: [{ name: "Test A", email: "a@one.example.com" }],
      openCases: 2,
      waitingOnUsCount: 1,
      lastActivityAt: "2026-10-05T00:00:00.000Z",
    })
    expect(two).toMatchObject({ contacts: [], openCases: 0, waitingOnUsCount: 0, lastActivityAt: null })
  })
})

describe("toCrmThread", () => {
  it("passes Hill's { messages } through, oldest first", () => {
    const thread = crmFixtureThread(NOW)
    expect(toCrmThread(json({ messages: [...thread].reverse() }), "case-test-1")).toEqual(thread)
  })

  it("filters today's summary to the case, mapping each message", () => {
    const roster = LEGACY.data.cases.find((c) => c.subject === "Roster import fails on a CSV with accents")!
    const out = toCrmThread(json(LEGACY), roster.id)!
    const legacy = LEGACY.data.messages.filter((m) => m.caseId === roster.id)
    expect(out.map((m) => m.id)).toEqual(legacy.map((m) => m.id))
    expect(out[0]).toMatchObject({ from: { email: legacy[0]!.fromEmail }, cc: [], bodyText: legacy[0]!.bodyText })
  })

  it("not connected has no thread; garbage is null", () => {
    expect(toCrmThread(json(gmailNotConnected()), "case-1")).toEqual([])
    expect(toCrmThread(42, "case-1")).toBeNull()
  })
})
