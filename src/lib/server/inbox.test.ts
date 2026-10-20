// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import type { SentryIssue } from "@/lib/inbox-sources"
import { readInbox } from "@/lib/server/inbox"
import type { SentryRead, SentryService } from "@/lib/server/sentry"
import type { WorkboardService } from "@/lib/server/workboard"
import type { WorkboardItem, WorkboardResponse } from "@/lib/workboard"

const NOW = new Date("2026-10-18T20:00:00.000Z")

const PR: WorkboardItem = {
  number: 51,
  title: "Workboard",
  url: "https://github.com/rbates7/hotdash/pull/51",
  owner: "rbates7",
  state: "ready_for_review",
  ci: "passing",
  review: "none",
  updatedAt: "2026-10-18T19:00:00Z",
  mergedAt: null,
}

const ISSUE: SentryIssue = {
  id: "7",
  shortId: "CHLK-IOS-7",
  title: "Crash",
  permalink: "https://chlk.sentry.io/issues/7/",
  level: "fatal",
  status: "unresolved",
  substatus: "regressed",
  count: "3",
  userCount: 1,
  firstSeen: "2026-10-01T00:00:00Z",
  lastSeen: "2026-10-18T19:30:00Z",
}

function workboard(body: WorkboardResponse | Error): WorkboardService {
  return {
    read: vi.fn(async () => {
      if (body instanceof Error) throw body
      return body
    }),
    settled: async () => {},
    reset: () => {},
  }
}

function sentry(read: SentryRead | Error): SentryService {
  return {
    read: () => {
      if (read instanceof Error) throw read
      return read
    },
    settled: async () => {},
    reset: () => {},
  }
}

const now = () => NOW

describe("readInbox", () => {
  it("merges GitHub and Sentry rows; Gmail is not connected", async () => {
    const inbox = await readInbox({
      workboard: workboard({ status: "connected", connected: true, fetchedAt: NOW.toISOString(), stale: false, items: [PR] }),
      sentry: sentry({ status: "connected", fetchedAt: NOW.toISOString(), issues: [ISSUE] }),
      now,
    })
    expect(inbox.sources).toEqual({
      github: { status: "connected", fetchedAt: NOW.toISOString() },
      sentry: { status: "connected", fetchedAt: NOW.toISOString() },
      gmail: { status: "not_connected", fetchedAt: null },
    })
    expect(inbox.items.map((i) => [i.id, i.unread])).toEqual([
      ["sentry-7", true],
      ["github-pr-51", true],
    ])
  })

  it("says connecting while the first syncs run, with no rows", async () => {
    const inbox = await readInbox({
      workboard: workboard({ status: "connecting", connected: false, fetchedAt: NOW.toISOString(), stale: false, items: [] }),
      sentry: sentry({ status: "connecting", fetchedAt: null, issues: [] }),
      now,
    })
    expect(inbox.sources.github.status).toBe("connecting")
    expect(inbox.sources.sentry.status).toBe("connecting")
    expect(inbox.items).toEqual([])
  })

  it("each source fails on its own", async () => {
    const inbox = await readInbox({
      workboard: workboard(new Error("boom")),
      sentry: sentry({ status: "stale", fetchedAt: NOW.toISOString(), issues: [ISSUE] }),
      now,
    })
    expect(inbox.sources.github.status).toBe("not_connected")
    expect(inbox.sources.sentry.status).toBe("stale")
    expect(inbox.items.map((i) => i.id)).toEqual(["sentry-7"])

    const other = await readInbox({
      workboard: workboard({ status: "stale", connected: true, fetchedAt: NOW.toISOString(), stale: true, items: [PR] }),
      sentry: sentry(new Error("boom")),
      now,
    })
    expect(other.sources.github.status).toBe("stale")
    expect(other.sources.sentry.status).toBe("not_connected")
    expect(other.items.map((i) => i.id)).toEqual(["github-pr-51"])
  })

  it("GitHub's state is the workboard's status: not_connected passes through, with no rows", async () => {
    const inbox = await readInbox({
      workboard: workboard({ status: "not_connected", connected: false, fetchedAt: NOW.toISOString(), stale: false, items: [] }),
      sentry: sentry({ status: "not_connected", fetchedAt: null, issues: [] }),
      now,
    })
    expect(inbox.sources.github).toEqual({ status: "not_connected", fetchedAt: null })
    expect(inbox.items).toEqual([])
  })
})
