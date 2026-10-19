import { describe, expect, it } from "vitest"

import { needsYou } from "@/lib/home"
import { inboxScreen, inboxStatus, onInboxFailure, sourceList, staleSince, type InboxResponse } from "@/lib/inbox-sources"
import { connectingInbox, emptyInbox, liveInbox, mixedInbox, notConnectedInbox, staleInbox } from "@/test/inbox-fixture"

const TZ = "America/Chicago"

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
    expect(inboxScreen({ phase: "loading" }, TZ)).toEqual({ status: "loading", items: [], needsYou: [], staleSince: null, stale: [], notes: [], connecting: [] })
  })

  it("connected: the real rows, and Gmail noted as not connected", () => {
    const screen = inboxScreen({ phase: "ready", inbox: liveInbox(NOW) }, TZ)
    expect(screen.status).toBe("connected")
    expect(screen.items).toHaveLength(5)
    expect(screen.notes).toEqual(["Gmail: Not connected"])
  })

  it("stale keeps the rows and says since when", () => {
    const screen = inboxScreen({ phase: "ready", inbox: staleInbox(NOW) }, TZ)
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
      const screen = inboxScreen({ phase: "ready", inbox }, TZ)
      expect(screen.status).toBe(status)
      expect(screen.items).toEqual([])
    }
  })

  it("a failed first read is not connected; a failed retry never goes back to connecting", () => {
    const first = onInboxFailure({ phase: "loading" }, new Date(NOW))
    expect(inboxScreen(first, TZ).status).toBe("not_connected")
    const retry = onInboxFailure({ phase: "ready", inbox: connectingInbox(NOW) }, new Date(NOW))
    expect(inboxScreen(retry, TZ).status).toBe("not_connected")
    const live = onInboxFailure({ phase: "ready", inbox: liveInbox(NOW) }, new Date(NOW))
    expect(inboxScreen(live, TZ).status).toBe("stale")
    expect(inboxScreen(live, TZ).items).toHaveLength(5)
  })
})

describe("mixed staleness", () => {
  it("GitHub live + Sentry stale: overall connected, but Sentry's last sync is still shown", () => {
    const screen = inboxScreen({ phase: "ready", inbox: mixedInbox(NOW) }, TZ)
    expect(screen.status).toBe("connected")
    expect(screen.items).toHaveLength(5)
    expect(screen.staleSince?.getTime()).toBe(NOW - 47 * 60_000)
    // 19:13 UTC is 2:13 PM CDT.
    expect(screen.stale).toEqual(["Sentry: Last updated Sun, Oct 18 · 2:13 PM CDT"])
    expect(screen.notes).toEqual(["Gmail: Not connected"])
  })

  it("all stale: one dated line per source, no timeless 'Last updated earlier'", () => {
    const screen = inboxScreen({ phase: "ready", inbox: staleInbox(NOW) }, TZ)
    expect(screen.stale).toEqual([
      "GitHub: Last updated Sun, Oct 18 · 2:13 PM CDT",
      "Sentry: Last updated Sun, Oct 18 · 2:13 PM CDT",
    ])
    expect(screen.notes.join(" ")).not.toMatch(/earlier/)
  })
})

describe("connecting names only the sources that are connecting", () => {
  it("lists them", () => {
    const one = { ...connectingInbox(NOW), sources: { ...connectingInbox(NOW).sources, github: { status: "not_connected", fetchedAt: null } } } as InboxResponse
    expect(inboxScreen({ phase: "ready", inbox: one }, TZ).connecting).toEqual(["Sentry"])
    expect(inboxScreen({ phase: "ready", inbox: connectingInbox(NOW) }, TZ).connecting).toEqual(["GitHub", "Sentry"])
    expect(sourceList(["GitHub", "Sentry"])).toBe("GitHub and Sentry")
    expect(sourceList(["Sentry"])).toBe("Sentry")
  })
})

describe("Home's Needs you from the live Inbox", () => {
  it("is only the rows that need the founder: no 'PR needs a fix', no ongoing Sentry rows", () => {
    const screen = inboxScreen({ phase: "ready", inbox: liveInbox(NOW) }, TZ)
    const needs = needsYou(screen.needsYou, [])
    expect(needs.items.map((i) => i.id)).toEqual(["github-pr-912", "sentry-7001", "sentry-7002"])
    expect(needs.waiting).toBe(3)
    expect(needs.items.some((i) => /needs a fix|Ongoing/.test(i.title))).toBe(false)
    // The Inbox tab keeps all five.
    expect(screen.items).toHaveLength(5)
  })
})
