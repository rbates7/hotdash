import { describe, expect, it } from "vitest"

import {
  combineStaleNotes,
  fromSentry,
  fromWorkboard,
  INBOX_CONNECTING_POLL_MS,
  INBOX_POLL_MS,
  inboxPollMs,
  type InboxResponse,
  mergeInbox,
  needsYouItems,
  onInboxFailure,
  parseInboxResponse,
  type SentryIssue,
  sourceNotes,
} from "@/lib/inbox-sources"
import type { WorkboardItem } from "@/lib/workboard"

const NOW = new Date("2026-10-18T20:00:00.000Z")

const pr = (n: number, state: WorkboardItem["state"], extra: Partial<WorkboardItem> = {}): WorkboardItem => ({
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/rbates7/hotdash/pull/${n}`,
  owner: "rbates7",
  state,
  ci: "passing",
  review: "none",
  updatedAt: `2026-10-18T1${n % 10}:00:00Z`,
  mergedAt: state === "merged" ? "2026-10-18T10:00:00Z" : null,
  ...extra,
})

const issue = (id: string, extra: Partial<SentryIssue> = {}): SentryIssue => ({
  id,
  shortId: `CHLK-IOS-${id}`,
  title: `Crash ${id}`,
  permalink: `https://chlk.sentry.io/issues/${id}/`,
  level: "error",
  status: "unresolved",
  substatus: "new",
  count: "12",
  userCount: 3,
  firstSeen: "2026-10-18T18:00:00Z",
  lastSeen: "2026-10-18T19:30:00Z",
  ...extra,
})

describe("fromWorkboard", () => {
  it("ready for review needs you; needs fix is informational; the rest are not rows", () => {
    const rows = fromWorkboard([
      pr(1, "ready_for_review"),
      pr(2, "needs_fix", { ci: "failing" }),
      pr(3, "needs_fix", { review: "changes_requested" }),
      pr(4, "needs_fix"),
      pr(5, "working"),
      pr(6, "merged"),
    ])
    expect(rows.map((r) => [r.id, r.unread, r.title])).toEqual([
      ["github-pr-1", true, "PR ready for review"],
      ["github-pr-2", false, "PR needs a fix · CI failing"],
      ["github-pr-3", false, "PR needs a fix · Changes requested"],
      ["github-pr-4", false, "PR needs a fix · Merge conflict"],
    ])
    expect(rows[0]).toMatchObject({ source: "github", snippet: "#1 PR 1", url: "https://github.com/rbates7/hotdash/pull/1" })
  })
})

describe("fromSentry", () => {
  it("new, regressed and escalating error/fatal issues need you", () => {
    const rows = fromSentry(
      [issue("1"), issue("2", { substatus: "regressed", level: "fatal" }), issue("3", { substatus: "escalating" })],
      NOW
    )
    expect(rows.map((r) => [r.title, r.unread])).toEqual([
      ["Error · New issue", true],
      ["Crash · Regressed", true],
      ["Error · Escalating", true],
    ])
    expect(rows[0]).toMatchObject({
      snippet: "CHLK-IOS-1 Crash 1 · 12 events, 3 users",
      at: "2026-10-18T18:00:00Z",
      url: "https://chlk.sentry.io/issues/1/",
    })
    expect(rows[1].at).toBe("2026-10-18T19:30:00Z")
  })

  it("ongoing issues seen in the last day are informational; older ones are dropped", () => {
    const rows = fromSentry(
      [issue("1", { substatus: "ongoing" }), issue("2", { substatus: "ongoing", lastSeen: "2026-10-16T19:00:00Z" })],
      NOW
    )
    expect(rows.map((r) => [r.id, r.unread, r.title])).toEqual([["sentry-1", false, "Error · Ongoing"]])
  })

  it("skips warnings, resolved issues and links that are not Sentry's", () => {
    expect(
      fromSentry(
        [
          issue("1", { level: "warning" }),
          issue("2", { status: "resolved" }),
          issue("3", { permalink: "https://evil.example/issues/3" }),
          issue("4", { permalink: "javascript:alert(1)" }),
        ],
        NOW
      )
    ).toEqual([])
  })

  it("says 1 event, 1 user", () => {
    expect(fromSentry([issue("1", { count: 1, userCount: 1 })], NOW)[0].snippet).toMatch(/1 event, 1 user$/)
  })
})

describe("mergeInbox / needsYouItems", () => {
  it("newest first across sources; needs you is the unread, undismissed rows", () => {
    const merged = mergeInbox(fromWorkboard([pr(1, "ready_for_review"), pr(2, "needs_fix", { ci: "failing" })]), fromSentry([issue("9")], NOW))
    expect(merged.map((r) => r.id)).toEqual(["sentry-9", "github-pr-2", "github-pr-1"])
    expect(needsYouItems(merged).map((r) => r.id)).toEqual(["sentry-9", "github-pr-1"])
    expect(needsYouItems([{ ...merged[0], dismissed: true }])).toEqual([])
  })
})

const RESPONSE: InboxResponse = {
  fetchedAt: NOW.toISOString(),
  sources: {
    github: { status: "connected", fetchedAt: NOW.toISOString() },
    sentry: { status: "connecting", fetchedAt: null },
    gmail: { status: "not_connected", fetchedAt: null },
  },
  items: fromWorkboard([pr(1, "ready_for_review")]),
}

describe("parseInboxResponse", () => {
  it("round-trips a response", () => {
    expect(parseInboxResponse(JSON.parse(JSON.stringify(RESPONSE)))).toEqual(RESPONSE)
  })

  it("rejects anything incomplete or with a bad link", () => {
    expect(parseInboxResponse(null)).toBeNull()
    expect(parseInboxResponse({ ...RESPONSE, fetchedAt: "now" })).toBeNull()
    expect(parseInboxResponse({ ...RESPONSE, sources: { ...RESPONSE.sources, gmail: undefined } })).toBeNull()
    expect(parseInboxResponse({ ...RESPONSE, sources: { ...RESPONSE.sources, gmail: { status: "sample", fetchedAt: null } } })).toBeNull()
    expect(parseInboxResponse({ ...RESPONSE, items: [{ ...RESPONSE.items[0], url: "javascript:alert(1)" }] })).toBeNull()
    expect(parseInboxResponse({ ...RESPONSE, items: [{ ...RESPONSE.items[0], source: "slack" }] })).toBeNull()
  })
})

describe("in the browser", () => {
  it("notes every source that is not live", () => {
    expect(sourceNotes(RESPONSE.sources, "America/Chicago")).toEqual(["Sentry: Connecting…", "Gmail: Not connected"])
  })

  it("polls every 5 s while a source is connecting", () => {
    expect(inboxPollMs({ phase: "ready", inbox: RESPONSE })).toBe(INBOX_CONNECTING_POLL_MS)
    const live = { ...RESPONSE, sources: { ...RESPONSE.sources, sentry: { status: "connected" as const, fetchedAt: NOW.toISOString() } } }
    expect(inboxPollMs({ phase: "ready", inbox: live })).toBe(INBOX_POLL_MS)
    expect(inboxPollMs({ phase: "loading" })).toBe(INBOX_POLL_MS)
  })

  it("a failed read keeps rows with live sources stale; with none, nothing and not connected", () => {
    const after = onInboxFailure({ phase: "ready", inbox: RESPONSE }, NOW)
    if (after.phase !== "ready") throw new Error("ready")
    expect(after.inbox.items).toEqual(RESPONSE.items)
    expect(after.inbox.sources.github.status).toBe("stale")
    expect(after.inbox.sources.sentry.status).toBe("not_connected")
    expect(after.inbox.sources.gmail.status).toBe("not_connected")

    const empty = onInboxFailure({ phase: "loading" }, NOW)
    if (empty.phase !== "ready") throw new Error("ready")
    expect(empty.inbox.items).toEqual([])
    expect(Object.values(empty.inbox.sources).every((s) => s.status === "not_connected")).toBe(true)
  })
})

describe("combineStaleNotes", () => {
  it("says one time once for several sources, and keeps different times apart, in order", () => {
    const at = "Last updated Tue, Oct 13 · 9:41 AM CDT"
    expect(combineStaleNotes([`GitHub: ${at}`, `Sentry: ${at}`])).toEqual([`GitHub and Sentry: ${at}`])
    expect(combineStaleNotes([`GitHub: ${at}`, "Sentry: Last updated Tue, Oct 13 · 9:12 AM CDT"])).toEqual([
      `GitHub: ${at}`,
      "Sentry: Last updated Tue, Oct 13 · 9:12 AM CDT",
    ])
    expect(combineStaleNotes([`Sentry: ${at}`])).toEqual([`Sentry: ${at}`])
    expect(combineStaleNotes([])).toEqual([])
  })
})
