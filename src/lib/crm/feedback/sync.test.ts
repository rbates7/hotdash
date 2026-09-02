import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages } from "@/lib/crm/db/schema"
import type { SupabaseFeedbackRow } from "@/lib/crm/supabase/mapping"

import { feedbackKey, isFeedbackThread } from "./keys"
import {
  feedbackBody,
  feedbackSubject,
  syncFeedback,
  type FeedbackSource,
} from "./sync"

function fakeSource(rows: SupabaseFeedbackRow[]): FeedbackSource {
  return {
    async fetchRows(limit, offset) {
      return rows.slice(offset, offset + limit)
    },
    async close() {},
  }
}

// The shape chlk.feedback really has: the sender's email on the row, the
// words in `feedback` (selected as message) and a chance-to-recommend score.
const rows: SupabaseFeedbackRow[] = [
  {
    id: "f1",
    email: "Coach@School.edu",
    first_name: "Pat",
    last_name: "Rivera",
    message: "The play editor crashes when I rotate the iPad mid-drag. Happens every time.",
    score: 3,
    created_at: "2026-08-30T10:00:00Z",
  },
  {
    id: "f2",
    email: "dana@acme.com",
    message: "Love the new film tags!",
    score: null,
    created_at: "2026-08-31T10:00:00Z",
  },
  // No sender: skipped.
  { id: "f3", email: null, message: "no sender", score: 5, created_at: null },
  // Neither words nor a score: skipped.
  { id: "f4", email: "x@y.z", message: "   ", score: null, created_at: null },
  // A score and nothing else still opens a case.
  { id: "f5", email: "quiet@y.z", message: null, score: "9", created_at: "2026-09-01T10:00:00Z" },
]

describe("syncFeedback", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    createContact(db, { email: "dana@acme.com", firstName: "Dana", source: "stripe" })
  })

  it("turns each submission into a case that needs a reply", async () => {
    const stats = await syncFeedback(db, fakeSource(rows))
    expect(stats).toEqual({ rowsSeen: 5, casesCreated: 3, contactsCreated: 2, skipped: 2 })

    const pat = db.select().from(contacts).where(eq(contacts.email, "coach@school.edu")).get()!
    expect(pat.firstName).toBe("Pat")
    expect(pat.source).toBe("supabase")

    const bug = db.select().from(cases).where(eq(cases.gmailThreadId, feedbackKey("f1"))).get()!
    expect(bug.subject).toBe(
      "Rated 3 · The play editor crashes when I rotate the iPad mid-drag. Happens every…"
    )
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
    expect(message.bodyText).toBe(
      "Chance to recommend: 3\n\nThe play editor crashes when I rotate the iPad mid-drag. Happens every time."
    )
    expect(message.fromName).toBe("Pat Rivera")

    // Words without a score: the subject is just the words.
    const tags = db.select().from(cases).where(eq(cases.gmailThreadId, feedbackKey("f2"))).get()!
    expect(tags.subject).toBe("Love the new film tags!")
  })

  it("opens a case for a score with no words, so everyone gets a follow-up", async () => {
    await syncFeedback(db, fakeSource(rows))
    const quiet = db.select().from(contacts).where(eq(contacts.email, "quiet@y.z")).get()!
    expect(quiet.firstName).toBeNull()
    const caseRow = db.select().from(cases).where(eq(cases.contactId, quiet.id)).get()!
    expect(caseRow.subject).toBe("Rated 9")
    const message = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, caseRow.id))
      .get()!
    expect(message.bodyText).toBe("Gave a score of 9 and no comment.")
  })

  it("is idempotent, and puts back a message a case has lost", async () => {
    await syncFeedback(db, fakeSource(rows))
    const again = await syncFeedback(db, fakeSource(rows))
    expect(again).toEqual({ rowsSeen: 5, casesCreated: 0, contactsCreated: 0, skipped: 5 })
    expect(db.select().from(cases).all()).toHaveLength(3)

    db.delete(emailMessages).where(eq(emailMessages.gmailMessageId, feedbackKey("f2"))).run()
    const healed = await syncFeedback(db, fakeSource(rows))
    expect(healed.casesCreated).toBe(0)
    expect(healed.skipped).toBe(4)
    expect(db.select().from(emailMessages).all()).toHaveLength(3)
    expect(db.select().from(cases).all()).toHaveLength(3)
  })

  it("pages through everything", async () => {
    const many: SupabaseFeedbackRow[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `m${i}`,
      email: `u${i}@x.io`,
      message: `feedback ${i}`,
      score: i % 11,
      created_at: "2026-08-01T00:00:00Z",
    }))
    const stats = await syncFeedback(db, fakeSource(many))
    expect(stats.rowsSeen).toBe(1200)
    expect(stats.casesCreated).toBe(1200)
  })
})

describe("feedbackSubject and feedbackBody", () => {
  it("leads with the score when there is one, as given", () => {
    expect(feedbackSubject("Great app", 8)).toBe("Rated 8 · Great app")
    expect(feedbackSubject(null, 8)).toBe("Rated 8")
    expect(feedbackSubject("Great app", null)).toBe("Great app")
    expect(feedbackSubject("   ", null)).toBe("In-app feedback")
    expect(feedbackSubject("Solid", 0)).toBe("Rated 0 · Solid")
  })

  it("stores the score above the words", () => {
    expect(feedbackBody("Great app", 8)).toBe("Chance to recommend: 8\n\nGreat app")
    expect(feedbackBody("Great app", null)).toBe("Great app")
    expect(feedbackBody("  ", 8)).toBe("Gave a score of 8 and no comment.")
  })
})
