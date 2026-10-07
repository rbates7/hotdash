import { describe, expect, it } from "vitest"

import { needsYou } from "@/lib/home"
import { formatAge, openInboxItems, pendingInboxItems } from "@/lib/inbox"
import { buildIssues } from "@/lib/issues-fixture"
import { buildInbox } from "@/lib/workplace-fixture"
import { FIXED_NOW } from "@/test/clock"

const issues = buildIssues(FIXED_NOW)
const inbox = buildInbox(FIXED_NOW)

const markDone = (keys: string[]) =>
  issues.map((i) => (keys.includes(i.key) ? { ...i, status: "done" as const } : i))

describe("openInboxItems", () => {
  it("keeps every seed row, dismissed digests included", () => {
    expect(openInboxItems(inbox, issues).map((i) => i.id)).toEqual([
      "408-review",
      "412-blocked",
      "406-urgent",
      "standup-digest",
    ])
  })

  it("drops a row once its ticket is done", () => {
    expect(openInboxItems(inbox, markDone(["CHLK-412"])).map((i) => i.id)).toEqual([
      "408-review",
      "406-urgent",
      "standup-digest",
    ])
  })

  it("drops a row whose ticket no longer exists but keeps ticketless digests", () => {
    const without = issues.filter((i) => i.key !== "CHLK-408")
    expect(openInboxItems(inbox, without).map((i) => i.id)).toEqual([
      "412-blocked",
      "406-urgent",
      "standup-digest",
    ])
  })
})

describe("pendingInboxItems", () => {
  it("is the open rows minus dismissed ones", () => {
    expect(pendingInboxItems(inbox, issues).map((i) => i.id)).toEqual([
      "408-review",
      "412-blocked",
      "406-urgent",
    ])
  })
})

describe("Home and the Inbox agree", () => {
  it("Home's Needs-you rows are exactly the pending Inbox rows", () => {
    for (const done of [[], ["CHLK-408"], ["CHLK-408", "CHLK-412", "CHLK-406"]]) {
      const board = markDone(done)
      expect(needsYou(inbox, board).items).toEqual(pendingInboxItems(inbox, board))
    }
  })

  it("when Home says nothing needs you, the Inbox holds only dismissed rows", () => {
    const board = markDone(["CHLK-408", "CHLK-412", "CHLK-406"])
    expect(needsYou(inbox, board).items).toEqual([])
    expect(openInboxItems(inbox, board).every((i) => i.dismissed)).toBe(true)
  })
})

describe("buildInbox + formatAge", () => {
  it("dates the rows relative to the given instant and shows them as ages", () => {
    const ages = inbox.map((i) => formatAge(i.at, FIXED_NOW))
    expect(ages).toEqual(["18m", "2h", "4h", "Yesterday"])
  })

  it("the same rows built on another day read the same, measured from that day", () => {
    const later = new Date("2027-03-02T20:00:00Z")
    const rows = buildInbox(later)
    expect(rows.map((i) => formatAge(i.at, later))).toEqual(["18m", "2h", "4h", "Yesterday"])
    // Built from one instant but read against a later one, they age honestly.
    expect(formatAge(inbox[0].at, later)).toMatch(/^\d+d$/)
  })

  it("formatAge thresholds", () => {
    const at = (ms: number) => new Date(FIXED_NOW.getTime() - ms).toISOString()
    expect(formatAge(at(10_000), FIXED_NOW)).toBe("now")
    expect(formatAge(at(59 * 60_000), FIXED_NOW)).toBe("59m")
    expect(formatAge(at(60 * 60_000), FIXED_NOW)).toBe("1h")
    expect(formatAge(at(23.9 * 3_600_000), FIXED_NOW)).toBe("23h")
    expect(formatAge(at(24 * 3_600_000), FIXED_NOW)).toBe("Yesterday")
    expect(formatAge(at(47 * 3_600_000), FIXED_NOW)).toBe("Yesterday")
    expect(formatAge(at(48 * 3_600_000), FIXED_NOW)).toBe("2d")
  })
})
