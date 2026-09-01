import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createDb, type Db } from "@/lib/crm/db/client"
import {
  cases,
  contacts,
  emailMessages,
  ignoredSenders,
} from "@/lib/crm/db/schema"
import {
  FOUNDER,
  makeMessage,
  unknownHuman,
  unknownHumanFollowup,
} from "@/lib/crm/gmail/__fixtures__/messages"
import { FakeGmailApi } from "@/lib/crm/gmail/fake-api"
import { syncGmail } from "@/lib/crm/gmail/sync"

import { findContactByEmail } from "@/lib/crm/contacts/server"

import { countTriagePending, listTriageThreads, resolveTriage } from "./server"

describe("triage", () => {
  let db: Db

  beforeEach(async () => {
    db = createDb(":memory:").db
    const secondThread = makeMessage({
      id: "m_lena_other",
      threadId: "t_lena_2",
      from: "Lena Ortiz <lena@futurebridge.vc>",
      subject: "One more thing",
      text: "Separate thread.",
      sentAt: "2026-08-28T12:00:00Z",
    })
    const api = new FakeGmailApi(FOUNDER, [
      unknownHuman,
      unknownHumanFollowup,
      secondThread,
    ])
    await syncGmail(db, api, FOUNDER)
  })

  it("groups pending messages by thread", () => {
    const threads = listTriageThreads(db)
    expect(threads).toHaveLength(2)
    const main = threads.find((t) => t.gmailThreadId === "t_lena")!
    expect(main.messageCount).toBe(2)
    expect(main.senderEmail).toBe("lena@futurebridge.vc")
    expect(countTriagePending(db)).toBe(3)
  })

  it("promote creates a contact and cases for every pending thread from the sender", () => {
    const result = resolveTriage(db, {
      gmailThreadId: "t_lena",
      action: "promote",
    })
    expect(result.contactId).toBeTruthy()

    const contact = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "lena@futurebridge.vc"))
      .get()!
    expect(contact.firstName).toBe("Lena")
    expect(contact.lastName).toBe("Ortiz")
    expect(contact.nameSource).toBe("gmail")
    expect(contact.source).toBe("gmail")

    // Both threads became cases; nothing pending remains.
    expect(db.select().from(cases).all()).toHaveLength(2)
    expect(countTriagePending(db)).toBe(0)

    const promotedCase = db
      .select()
      .from(cases)
      .where(eq(cases.gmailThreadId, "t_lena"))
      .get()!
    expect(promotedCase.subject).toBe("Intro")
    const messages = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, promotedCase.id))
      .all()
    expect(messages).toHaveLength(2)
  })

  it("link attaches the thread to an existing contact", () => {
    const existing = db
      .insert(contacts)
      .values({
        id: "contact_x",
        email: "lena@futurebridge.vc",
        firstName: "Lena",
        lastName: "O.",
        nameSource: "manual",
        source: "manual",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
    expect(existing.changes).toBe(1)

    const result = resolveTriage(db, {
      gmailThreadId: "t_lena",
      action: "link",
      contactId: "contact_x",
    })
    expect(result.contactId).toBe("contact_x")
    const caseRow = db
      .select()
      .from(cases)
      .where(eq(cases.gmailThreadId, "t_lena"))
      .get()!
    expect(caseRow.contactId).toBe("contact_x")
  })

  it("ignore marks the thread; ignore-always drops the sender everywhere", () => {
    resolveTriage(db, { gmailThreadId: "t_lena", action: "ignore" })
    expect(countTriagePending(db)).toBe(1) // the second thread survives

    resolveTriage(db, {
      gmailThreadId: "t_lena_2",
      action: "ignore",
      ignoreSenderAlways: true,
    })
    expect(countTriagePending(db)).toBe(0)
    expect(
      db
        .select()
        .from(ignoredSenders)
        .where(eq(ignoredSenders.email, "lena@futurebridge.vc"))
        .get()
    ).toBeTruthy()
  })

  it("teaches the contact the address that was linked, so later threads become cases", async () => {
    // A coach writes from a personal address that Stripe has never seen.
    db.insert(contacts)
      .values({
        id: "contact_school",
        email: "coach@school.edu",
        firstName: "Coach",
        lastName: "Reyes",
        nameSource: "stripe",
        source: "stripe",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()

    resolveTriage(db, {
      gmailThreadId: "t_lena",
      action: "link",
      contactId: "contact_school",
    })

    // The linked address now resolves to that contact...
    expect(findContactByEmail(db, "lena@futurebridge.vc")?.id).toBe(
      "contact_school"
    )

    // ...so a brand-new thread from it opens a case instead of returning
    // to triage, which was the whole point of linking.
    const followUp = makeMessage({
      id: "m_lena_third",
      threadId: "t_lena_3",
      from: "Lena Ortiz <lena@futurebridge.vc>",
      subject: "Third thread",
      text: "Following up again.",
      sentAt: "2026-08-29T10:00:00Z",
    })
    const api = new FakeGmailApi(FOUNDER, [followUp])
    api.historyId = "2000"
    api.historyBatches = [{ historyId: "2000", ids: ["m_lena_third"] }]
    await syncGmail(db, api, FOUNDER)

    const newCase = db
      .select()
      .from(cases)
      .where(eq(cases.gmailThreadId, "t_lena_3"))
      .get()
    expect(newCase).toBeTruthy()
    expect(newCase!.contactId).toBe("contact_school")
  })

  it("ignores the sender shown on the thread, not an arbitrary one", async () => {
    // A second person replies into the thread; the UI labels the thread
    // with the newest sender, so that is who must be blacklisted.
    const reply = makeMessage({
      id: "m_lena_colleague",
      threadId: "t_lena",
      from: "Priya Colleague <colleague@futurebridge.vc>",
      subject: "Re: Intro",
      text: "Adding my colleague.",
      sentAt: "2026-08-29T12:00:00Z",
    })
    const api = new FakeGmailApi(FOUNDER, [reply])
    api.historyId = "2000"
    api.historyBatches = [{ historyId: "2000", ids: ["m_lena_colleague"] }]
    await syncGmail(db, api, FOUNDER)

    resolveTriage(db, {
      gmailThreadId: "t_lena",
      action: "ignore",
      ignoreSenderAlways: true,
    })

    const ignored = db.select().from(ignoredSenders).all()
    expect(ignored.map((row) => row.email)).toContain(
      "colleague@futurebridge.vc"
    )
  })
})
