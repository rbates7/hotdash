import { describe, expect, it } from "vitest"

import { needsYou } from "@/lib/home"
import { openInboxItems, pendingInboxItems } from "@/lib/inbox"
import { issues } from "@/lib/issues-fixture"
import { inbox } from "@/lib/workplace-fixture"

const markDone = (keys: string[]) =>
  issues.map((i) => (keys.includes(i.key) ? { ...i, status: "done" as const } : i))

describe("openInboxItems", () => {
  it("keeps every seed row, dismissed digests included", () => {
    expect(openInboxItems(inbox, issues).map((i) => i.id)).toEqual([
      "408-review",
      "412-blocked",
      "406-urgent",
      "standup-aug-25",
    ])
  })

  it("drops a row once its ticket is done", () => {
    expect(openInboxItems(inbox, markDone(["CHLK-412"])).map((i) => i.id)).toEqual([
      "408-review",
      "406-urgent",
      "standup-aug-25",
    ])
  })

  it("drops a row whose ticket no longer exists but keeps ticketless digests", () => {
    const without = issues.filter((i) => i.key !== "CHLK-408")
    expect(openInboxItems(inbox, without).map((i) => i.id)).toEqual([
      "412-blocked",
      "406-urgent",
      "standup-aug-25",
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
