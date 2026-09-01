import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/contacts/server"
import { createDb, type Db } from "@/lib/db/client"
import {
  cases,
  emailMessages,
  ignoredSenders,
  notes,
  syncState,
} from "@/lib/db/schema"

import {
  FOUNDER,
  inboundPlainDana,
  inboundReplyDana,
  makeMessage,
  newsletter,
  noreplyReceipt,
  outboundReplyFounder,
  spamMessage,
  unknownHuman,
  unknownHumanFollowup,
} from "./__fixtures__/messages"
import { FakeGmailApi } from "./fake-api"
import { syncGmail } from "./sync"

describe("syncGmail", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    createContact(db, {
      email: "dana@acme.com",
      firstName: "Dana",
      lastName: "Whitfield",
      nameSource: "supabase",
      source: "stripe",
    })
  })

  it("full sync: known senders become cases, unknown humans triage, bulk is dropped", async () => {
    const api = new FakeGmailApi(FOUNDER, [
      inboundPlainDana,
      outboundReplyFounder,
      inboundReplyDana,
      unknownHuman,
      newsletter,
      noreplyReceipt,
      spamMessage,
    ])

    const stats = await syncGmail(db, api, FOUNDER)

    const allCases = db.select().from(cases).all()
    expect(allCases).toHaveLength(1)
    expect(allCases[0]!.subject).toBe("Can't invite teammates")
    expect(allCases[0]!.gmailThreadId).toBe("t_dana")
    // Chronological: inbound(new) → outbound(waiting) → inbound(open)
    expect(allCases[0]!.status).toBe("open")

    const caseMessages = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, allCases[0]!.id))
      .all()
    expect(caseMessages).toHaveLength(3)

    const triage = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.triageState, "pending"))
      .all()
    expect(triage).toHaveLength(1)
    expect(triage[0]!.fromEmail).toBe("lena@futurebridge.vc")

    expect(stats.skippedBulk).toBe(2)
    expect(stats.casesCreated).toBe(1)

    // Spam label excluded entirely.
    const spamStored = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, "m_spam"))
      .all()
    expect(spamStored).toHaveLength(0)

    const cursor = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .get()
    expect(cursor?.cursor).toBe("1000")
  })

  it("is idempotent across incremental re-runs", async () => {
    const api = new FakeGmailApi(FOUNDER, [
      inboundPlainDana,
      outboundReplyFounder,
      unknownHuman,
    ])
    await syncGmail(db, api, FOUNDER)
    const countAfterFirst = db.select().from(emailMessages).all().length

    // Incremental run replays the same ids.
    api.historyId = "1500"
    api.historyBatches = [
      { historyId: "1500", ids: ["m_dana_1", "m_dana_2", "m_lena_1"] },
    ]
    const stats = await syncGmail(db, api, FOUNDER)

    expect(db.select().from(emailMessages).all().length).toBe(countAfterFirst)
    expect(db.select().from(cases).all()).toHaveLength(1)
    expect(stats.stored).toBe(0)
    expect(api.calls.listHistory).toBe(1)
  })

  it("falls back to a full sync when the history cursor expired", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)

    api.add(inboundReplyDana)
    api.expireHistoryOnce = true
    api.historyId = "2000"
    const stats = await syncGmail(db, api, FOUNDER)

    expect(stats.fetched).toBe(2)
    expect(api.calls.listMessageIds).toBe(2)
    const cursor = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .get()
    expect(cursor?.cursor).toBe("2000")
  })

  it("backfills the whole thread when a case is created mid-conversation", async () => {
    // Only the latest inbound message is "delivered" by listing, but the
    // thread already contains the earlier exchange.
    const api = new FakeGmailApi(FOUNDER, [inboundReplyDana])
    api.add(inboundPlainDana)
    api.add(outboundReplyFounder)
    api.historyBatches = []
    // Deliver only m_dana_3 via listing.
    api.listMessageIds = async () => ({ ids: ["m_dana_3"] })

    const stats = await syncGmail(db, api, FOUNDER)

    const caseRow = db.select().from(cases).all()[0]!
    const stored = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, caseRow.id))
      .all()
    expect(stored).toHaveLength(3)
    expect(stats.backfilled).toBe(2)
    expect(caseRow.status).toBe("open")
  })

  it("drops mail from ignored senders", async () => {
    db.insert(ignoredSenders)
      .values({ email: "lena@futurebridge.vc", createdAt: new Date() })
      .run()
    const api = new FakeGmailApi(FOUNDER, [unknownHuman, unknownHumanFollowup])
    const stats = await syncGmail(db, api, FOUNDER)
    expect(db.select().from(emailMessages).all()).toHaveLength(0)
    expect(stats.stored).toBe(0)
  })

  it("reopens a closed case when the customer replies", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)
    const caseRow = db.select().from(cases).all()[0]!
    db.update(cases)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(cases.id, caseRow.id))
      .run()

    api.historyId = "1600"
    api.historyBatches = [{ historyId: "1600", ids: ["m_dana_3"] }]
    api.add(inboundReplyDana)
    await syncGmail(db, api, FOUNDER)

    const updated = db.select().from(cases).where(eq(cases.id, caseRow.id)).get()!
    expect(updated.status).toBe("open")
    expect(updated.closedAt).toBeNull()
    const systemNotes = db
      .select()
      .from(notes)
      .where(eq(notes.caseId, caseRow.id))
      .all()
    expect(
      systemNotes.some((n) => n.body.startsWith("Reopened by email"))
    ).toBe(true)
  })

  it("ignores founder-initiated threads with no case", async () => {
    const outboundOnly = makeMessage({
      id: "m_out_1",
      threadId: "t_lawyer",
      from: `Rashad <${FOUNDER}>`,
      to: "counsel@lawfirm.example",
      subject: "NDA draft",
      text: "Attached.",
      labels: ["SENT"],
      sentAt: "2026-08-27T13:00:00Z",
    })
    const api = new FakeGmailApi(FOUNDER, [outboundOnly])
    await syncGmail(db, api, FOUNDER)
    expect(db.select().from(emailMessages).all()).toHaveLength(0)
    expect(db.select().from(cases).all()).toHaveLength(0)
  })
})
