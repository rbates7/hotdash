import { describe, expect, it } from "vitest"

import {
  GMAIL_NOT_CONNECTED,
  gmailConnecting,
  gmailFeedOf,
  gmailNotConnected,
  parseGmailSummary,
} from "@/lib/crm/gmail-summary"
import { GMAIL_POLL_MS, gmailNextPollMs, gmailReducer } from "@/hooks/use-gmail-summary"
import { CONNECTING_POLL_MS } from "@/hooks/use-stripe-summary"
import { liveGmailSummary } from "@/test/gmail-fixture"

const NOW = Date.parse("2026-10-14T17:00:00.000Z")
const LIVE = liveGmailSummary(NOW)

describe("parseGmailSummary", () => {
  it("reads every state back", () => {
    expect(parseGmailSummary(JSON.parse(JSON.stringify(LIVE)))).toEqual(LIVE)
    expect(parseGmailSummary({ ...LIVE, status: "stale" })).toEqual({ ...LIVE, status: "stale" })
    expect(parseGmailSummary(GMAIL_NOT_CONNECTED)).toEqual(GMAIL_NOT_CONNECTED)
    expect(parseGmailSummary(gmailConnecting())).toEqual(gmailConnecting())
  })

  it("rejects anything incomplete or inconsistent", () => {
    expect(parseGmailSummary(null)).toBeNull()
    expect(parseGmailSummary({ status: "connected" })).toBeNull()
    expect(parseGmailSummary({ ...LIVE, lastSyncedAt: "yesterday" })).toBeNull()
    expect(parseGmailSummary({ ...LIVE, data: { ...LIVE.data, cases: [{ id: "case-1" }] } })).toBeNull()
    // A case pointing at a contact that is not there.
    const orphan = { ...LIVE.data!, contacts: LIVE.data!.contacts.slice(1) }
    expect(parseGmailSummary({ ...LIVE, data: orphan })).toBeNull()
    expect(parseGmailSummary({ ...LIVE, status: "weird" })).toBeNull()
  })

  it("keeps only the fields it knows, and a sane mailbox", () => {
    const parsed = parseGmailSummary({ ...LIVE, extra: "x", data: { ...LIVE.data, notes: ["x"] } })
    expect(parsed).toEqual(LIVE)
    expect(parseGmailSummary({ ...GMAIL_NOT_CONNECTED, mailbox: "<script>" })).toEqual(GMAIL_NOT_CONNECTED)
    expect(parseGmailSummary({ ...GMAIL_NOT_CONNECTED, mailbox: "help@chlkapp.com" })).toEqual(gmailNotConnected("help@chlkapp.com"))
  })
})

describe("gmailFeedOf", () => {
  it("loading, sample when not connected, live (stale or not) otherwise", () => {
    expect(gmailFeedOf({ phase: "loading" })).toEqual({ kind: "loading" })
    expect(gmailFeedOf({ phase: "ready", summary: GMAIL_NOT_CONNECTED })).toEqual({ kind: "sample", mailbox: "info@chlkapp.com" })
    // Connecting is loading, as in StripeFeed: never the sample.
    expect(gmailFeedOf({ phase: "ready", summary: gmailConnecting() })).toEqual({ kind: "loading", connecting: true })
    expect(gmailFeedOf({ phase: "ready", summary: { ...LIVE, status: "stale" } })).toMatchObject({
      kind: "live",
      stale: true,
      lastSyncedAt: new Date(LIVE.lastSyncedAt!),
      data: LIVE.data,
    })
  })
})

describe("gmailReducer (the browser's copy)", () => {
  it("our endpoint unreachable: keeps the last threads as stale, or reads as not connected with none", () => {
    expect(gmailReducer({ phase: "loading" }, { type: "failure" })).toEqual({ phase: "ready", summary: GMAIL_NOT_CONNECTED })
    expect(gmailReducer({ phase: "ready", summary: LIVE }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: { ...LIVE, status: "stale" },
    })
    expect(gmailReducer({ phase: "ready", summary: LIVE }, { type: "summary", summary: GMAIL_NOT_CONNECTED })).toEqual({
      phase: "ready",
      summary: GMAIL_NOT_CONNECTED,
    })
  })
})

describe("connecting in the browser (#50's pattern)", () => {
  it("polls at CONNECTING_POLL_MS while connecting, GMAIL_POLL_MS otherwise", () => {
    expect(gmailNextPollMs({ phase: "ready", summary: gmailConnecting() })).toBe(CONNECTING_POLL_MS)
    expect(gmailNextPollMs({ phase: "ready", summary: LIVE })).toBe(GMAIL_POLL_MS)
    expect(gmailNextPollMs({ phase: "ready", summary: GMAIL_NOT_CONNECTED })).toBe(GMAIL_POLL_MS)
    expect(gmailNextPollMs({ phase: "loading" })).toBe(GMAIL_POLL_MS)
  })

  it("our endpoint unreachable while connecting reads as not connected, never connecting forever", () => {
    expect(gmailReducer({ phase: "ready", summary: gmailConnecting() }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: GMAIL_NOT_CONNECTED,
    })
    expect(gmailReducer({ phase: "ready", summary: GMAIL_NOT_CONNECTED }, { type: "failure" })).toEqual({
      phase: "ready",
      summary: GMAIL_NOT_CONNECTED,
    })
  })
})
