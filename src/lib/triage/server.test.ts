import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createDb, type Db } from "@/lib/db/client"
import {
  cases,
  contacts,
  emailMessages,
  ignoredSenders,
} from "@/lib/db/schema"
import { FOUNDER, makeMessage, unknownHuman, unknownHumanFollowup } from "@/lib/gmail/__fixtures__/messages"
import { FakeGmailApi } from "@/lib/gmail/fake-api"
import { syncGmail } from "@/lib/gmail/sync"

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
})
