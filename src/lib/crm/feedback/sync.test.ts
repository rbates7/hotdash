import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages } from "@/lib/crm/db/schema"
import type { SupabaseFeedbackRow } from "@/lib/crm/supabase/mapping"

import { feedbackKey, isFeedbackThread } from "./keys"
import { feedbackSubject, syncFeedback, type FeedbackSource } from "./sync"

function fakeSource(rows: SupabaseFeedbackRow[]): FeedbackSource {
  return {
    async fetchRows(limit, offset) {
      return rows.slice(offset, offset + limit)
    },
    async close() {},
  }
}

const rows: SupabaseFeedbackRow[] = [
  {
    id: "f1",
    email: "Coach@School.edu",
    first_name: "Pat",
    last_name: "Rivera",
    message: "The play editor crashes when I rotate the iPad mid-drag. Happens every time.",
    category: "bug",
    created_at: "2026-08-30T10:00:00Z",
  },
  {
    id: "f2",
    email: "dana@acme.com",
    message: "Love the new film tags!",
    category: null,
    created_at: "2026-08-31T10:00:00Z",
  },
  { id: "f3", email: null, message: "no sender", created_at: null },
  { id: "f4", email: "x@y.z", message: "   ", created_at: null },
]

describe("syncFeedback", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    createContact(db, { email: "dana@acme.com", firstName: "Dana", source: "stripe" })
  })

  it("turns each piece of feedback into a case that needs a reply", async () => {
    const stats = await syncFeedback(db, fakeSource(rows))
    expect(stats).toEqual({ rowsSeen: 4, casesCreated: 2, contactsCreated: 1, skipped: 2 })

    const pat = db.select().from(contacts).where(eq(contacts.email, "coach@school.edu")).get()!
    expect(pat.firstName).toBe("Pat")
    expect(pat.source).toBe("supabase")

    const bug = db.select().from(cases).where(eq(cases.gmailThreadId, feedbackKey("f1"))).get()!
    expect(bug.subject).toBe("Bug: The play editor crashes when I rotate the iPad mid-drag. Happens every…")
    expect(bug.contactId).toBe(pat.id)
    expect(bug.status).toBe("new")
    expect(bug.lastInboundAt).toEqual(new Date("2026-08-30T10:00:00Z"))
    expect(bug.lastActivityAt).toEqual(new Date("2026-08-30T10:00:00Z"))
    expect(isFeedbackThread(bug.gmailThreadId)).toBe(true)

    const message = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, feedbackKey("f1")))
      .get()!
    expect(message.channel).toBe("feedback")
    expect(message.direction).toBe("inbound")
    expect(message.caseId).toBe(bug.id)
    expect(message.bodyText).toContain("rotate the iPad")
    expect(message.fromName).toBe("Pat Rivera")
  })

  it("is idempotent, and puts back a message a case has lost", async () => {
    await syncFeedback(db, fakeSource(rows))
    const again = await syncFeedback(db, fakeSource(rows))
    expect(again).toEqual({ rowsSeen: 4, casesCreated: 0, contactsCreated: 0, skipped: 4 })
    expect(db.select().from(cases).all()).toHaveLength(2)

    db.delete(emailMessages).where(eq(emailMessages.gmailMessageId, feedbackKey("f2"))).run()
    const healed = await syncFeedback(db, fakeSource(rows))
    expect(healed.casesCreated).toBe(0)
    expect(healed.skipped).toBe(3)
    expect(db.select().from(emailMessages).all()).toHaveLength(2)
    expect(db.select().from(cases).all()).toHaveLength(2)
  })

  it("pages through everything", async () => {
    const many: SupabaseFeedbackRow[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `m${i}`,
      email: `u${i}@x.io`,
      message: `feedback ${i}`,
      created_at: "2026-08-01T00:00:00Z",
    }))
    const stats = await syncFeedback(db, fakeSource(many))
    expect(stats.rowsSeen).toBe(1200)
    expect(stats.casesCreated).toBe(1200)
  })
})

describe("feedbackSubject", () => {
  it("leads with the category when there is one", () => {
    expect(feedbackSubject("Great app", "idea")).toBe("Idea: Great app")
    expect(feedbackSubject("Great app", "feature_request")).toBe("Feature request: Great app")
    expect(feedbackSubject("Great app", null)).toBe("Great app")
    expect(feedbackSubject("   ", null)).toBe("In-app feedback")
  })
})
