import { describe, expect, it } from "vitest"

import { needsYou } from "@/lib/home"
import { inboxScreen, inboxStatus, needsYouItems, onInboxFailure, staleSince, type InboxResponse } from "@/lib/inbox-sources"
import { connectingInbox, emptyInbox, liveInbox, notConnectedInbox, staleInbox } from "@/test/inbox-fixture"

const NOW = Date.parse("2026-10-18T20:00:00.000Z")
const src = (github: string, sentry: string, gmail = "not_connected") =>
  ({
    github: { status: github, fetchedAt: github === "stale" ? "2026-10-18T19:00:00.000Z" : null },
    sentry: { status: sentry, fetchedAt: sentry === "stale" ? "2026-10-18T19:30:00.000Z" : null },
    gmail: { status: gmail, fetchedAt: null },
  }) as InboxResponse["sources"]

describe("inboxStatus", () => {
  it.each([
    ["connected", "not_connected", "connected"],
    ["stale", "connected", "connected"],
    ["stale", "not_connected", "stale"],
    ["connecting", "stale", "stale"],
    ["connecting", "not_connected", "connecting"],
    ["not_connected", "not_connected", "not_connected"],
  ])("github %s + sentry %s → %s", (g, s, want) => {
    expect(inboxStatus(src(g, s))).toBe(want)
  })

  it("no token anywhere is never connecting", () => {
    expect(inboxStatus(notConnectedInbox(NOW).sources)).toBe("not_connected")
  })
})

describe("staleSince", () => {
  it("names the oldest stale sync, and null when nothing is stale", () => {
    expect(staleSince(src("stale", "stale"))?.toISOString()).toBe("2026-10-18T19:00:00.000Z")
    expect(staleSince(src("connected", "connecting"))).toBeNull()
  })
})

describe("inboxScreen", () => {
  it("is loading, with no rows, until the endpoint answers", () => {
    expect(inboxScreen({ phase: "loading" })).toEqual({ status: "loading", items: [], staleSince: null, notes: [] })
  })

  it("connected: the real rows, and Gmail noted as not connected", () => {
    const screen = inboxScreen({ phase: "ready", inbox: liveInbox(NOW) })
    expect(screen.status).toBe("connected")
    expect(screen.items).toHaveLength(5)
    expect(screen.notes).toEqual(["Gmail: Not connected"])
  })

  it("stale keeps the rows and says since when", () => {
    const screen = inboxScreen({ phase: "ready", inbox: staleInbox(NOW) })
    expect(screen.status).toBe("stale")
    expect(screen.items).toHaveLength(5)
    expect(screen.staleSince?.getTime()).toBe(NOW - 47 * 60_000)
  })

  it("empty, connecting and not connected have no rows", () => {
    for (const [inbox, status] of [
      [emptyInbox(NOW), "connected"],
      [connectingInbox(NOW), "connecting"],
      [notConnectedInbox(NOW), "not_connected"],
    ] as const) {
      const screen = inboxScreen({ phase: "ready", inbox })
      expect(screen.status).toBe(status)
      expect(screen.items).toEqual([])
    }
  })

  it("a failed first read is not connected; a failed retry never goes back to connecting", () => {
    const first = onInboxFailure({ phase: "loading" }, new Date(NOW))
    expect(inboxScreen(first).status).toBe("not_connected")
    const retry = onInboxFailure({ phase: "ready", inbox: connectingInbox(NOW) }, new Date(NOW))
    expect(inboxScreen(retry).status).toBe("not_connected")
    const live = onInboxFailure({ phase: "ready", inbox: liveInbox(NOW) }, new Date(NOW))
    expect(inboxScreen(live).status).toBe("stale")
    expect(inboxScreen(live).items).toHaveLength(5)
  })
})

describe("Home's Needs you from the live Inbox", () => {
  it("is the unread rows, in Inbox order, with the waiting count", () => {
    const { items } = liveInbox(NOW)
    const needs = needsYou(items, [])
    expect(needs.waiting).toBe(3)
    expect(needs.items.filter((i) => i.unread).map((i) => i.id)).toEqual(needsYouItems(items).map((i) => i.id))
  })
})
