import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import {
  createContact,
  findContactByEmail,
} from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import {
  cases,
  emailMessages,
  ignoredSenders,
  notes,
  syncState,
} from "@/lib/crm/db/schema"

import {
  FOUNDER,
  formSubmissionKnown,
  formSubmissionUnknown,
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
import { resetGmailCursor, syncGmail } from "./sync"

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

  it("ignores a widened window until the cursor is reset", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER, { initialWindow: "7d" })
    expect(api.lastQuery).toBe("-in:chat newer_than:7d")

    // Second pass resumes from the stored cursor, so the wider window is
    // never consulted — this is what made "just change the env var" a no-op.
    api.lastQuery = null
    await syncGmail(db, api, FOUNDER, { initialWindow: "2026-01-01" })
    expect(api.lastQuery).toBeNull()

    resetGmailCursor(db)
    await syncGmail(db, api, FOUNDER, { initialWindow: "2026-01-01" })
    expect(api.lastQuery).toBe("-in:chat after:2026/01/01")
  })

  it("routes a contact-form submission to the person, not the form host", async () => {
    const api = new FakeGmailApi(FOUNDER, [
      formSubmissionKnown,
      formSubmissionUnknown,
    ])
    const stats = await syncGmail(db, api, FOUNDER)

    // Dana is a known contact, so her submission opens a case for her even
    // though Squarespace sent the mail.
    expect(stats.casesCreated).toBe(1)
    expect(stats.skippedBulk).toBe(0)
    const [known] = db.select().from(cases).all()
    expect(known!.contactId).toBe(
      findContactByEmail(db, "dana@acme.com")!.id
    )

    // Marcus is not known yet, so he waits in triage as himself — promoting
    // him must not create a contact called Squarespace.
    expect(stats.triaged).toBe(1)
    const triaged = db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.gmailThreadId, "t_form_2"))
      .all()
    expect(triaged.map((m) => m.fromEmail)).toEqual([
      "marcus@northside.k12.us",
    ])
    expect(triaged[0]!.fromName).toBe("Marcus Hall")
  })

  it("backfills from a relative window by default", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)
    expect(api.lastQuery).toBe("-in:chat newer_than:30d")
  })

  it("backfills from an absolute date when one is configured", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER, { initialWindow: "2026-01-01" })
    expect(api.lastQuery).toBe("-in:chat after:2026/01/01")
  })

  it("falls back to the default rather than failing on a bad window", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    const stats = await syncGmail(db, api, FOUNDER, {
      initialWindow: "january",
    })
    expect(api.lastQuery).toBe("-in:chat newer_than:30d")
    expect(stats.stored).toBe(1)
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

    // The recovery lists both messages but only pays Gmail for the new one:
    // re-downloading what is already stored is what made a large backfill
    // too expensive to resume after it was rate limited.
    expect(stats.fetched).toBe(1)
    expect(api.calls.listMessageIds).toBe(2)
    const cursor = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .get()
    expect(cursor?.cursor).toBe("2000")
  })

  it("skips a message Gmail no longer has instead of dying on it every run", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)

    // History says two messages arrived; one was deleted before we asked.
    api.add(inboundReplyDana)
    api.historyBatches.push({
      historyId: "1500",
      ids: ["gone-for-good", inboundReplyDana.id!],
    })
    api.historyId = "1500"
    const stats = await syncGmail(db, api, FOUNDER)
    expect(stats.missing).toBe(1)
    expect(stats.fetched).toBe(1)
    expect(stats.stored).toBe(1)

    // The cursor moved on, so the next run does not trip over it again.
    const cursor = db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .get()
    expect(cursor?.cursor).toBe("1500")
    const again = await syncGmail(db, api, FOUNDER)
    expect(again.missing).toBe(0)
    expect(again.fetched).toBe(0)
  })

  it("keeps what it stored when fetching fails part way through", async () => {
    // The 8-month backfill ran for 230 seconds, hit Gmail's rate limit, and
    // discarded every message it had fetched. Chunked storing means a failure
    // costs the current chunk, and the next run skips what already landed.
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana, unknownHuman])
    const realGet = api.getMessage.bind(api)
    let calls = 0
    api.getMessage = async (id: string) => {
      if (++calls > 1) throw new Error("Quota exceeded for quota metric")
      return realGet(id)
    }

    await expect(
      syncGmail(db, api, FOUNDER, { fetchConcurrency: 1, fetchChunk: 1 })
    ).rejects.toThrow(/Quota exceeded/)

    const stored = db.select().from(emailMessages).all()
    expect(stored.length).toBeGreaterThan(0)

    // A re-run does not pay for the message it already has.
    api.getMessage = realGet
    const stats = await syncGmail(db, api, FOUNDER, { fetchChunk: 1 })
    expect(stats.fetched).toBe(1)
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
