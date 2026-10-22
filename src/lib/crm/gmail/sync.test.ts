import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"
import { createTestDb } from "@/lib/crm/db/test-client"
import {
  cases,
  emailMessages,
  ignoredSenders,
  notes,
  syncState,
} from "@/lib/crm/db/schema"

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
import { gmailFullSyncListQuery, syncGmail } from "./sync"

describe("gmailFullSyncListQuery", () => {
  it("supports relative windows and Gmail after: dates", () => {
    expect(gmailFullSyncListQuery("30d")).toBe("-in:chat newer_than:30d")
    expect(gmailFullSyncListQuery("after:2026/07/01")).toBe(
      "-in:chat after:2026/07/01"
    )
  })
})

describe("syncGmail", () => {
  let db: Db

  beforeEach(async () => {
    db = (await createTestDb()).db
    await createContact(db, {
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

    const allCases = await db.select().from(cases)
    expect(allCases).toHaveLength(1)
    expect(allCases[0]!.subject).toBe("Can't invite teammates")
    expect(allCases[0]!.gmailThreadId).toBe("t_dana")
    // Chronological: inbound(new) → outbound(waiting) → inbound(open)
    expect(allCases[0]!.status).toBe("open")

    const caseMessages = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, allCases[0]!.id))
    expect(caseMessages).toHaveLength(3)

    const triage = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.triageState, "pending"))
    expect(triage).toHaveLength(1)
    expect(triage[0]!.fromEmail).toBe("lena@futurebridge.vc")

    expect(stats.skippedBulk).toBe(2)
    expect(stats.casesCreated).toBe(1)

    // Spam label excluded entirely.
    const spamStored = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.gmailMessageId, "m_spam"))
    expect(spamStored).toHaveLength(0)

    const [cursor] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .limit(1)
    expect(cursor?.cursor).toBe("1000")
  })

  it("is idempotent across incremental re-runs", async () => {
    const api = new FakeGmailApi(FOUNDER, [
      inboundPlainDana,
      outboundReplyFounder,
      unknownHuman,
    ])
    await syncGmail(db, api, FOUNDER)
    const countAfterFirst = (await db.select().from(emailMessages)).length

    // Incremental run replays the same ids.
    api.historyId = "1500"
    api.historyBatches = [
      { historyId: "1500", ids: ["m_dana_1", "m_dana_2", "m_lena_1"] },
    ]
    const stats = await syncGmail(db, api, FOUNDER)

    expect((await db.select().from(emailMessages)).length).toBe(countAfterFirst)
    expect(await db.select().from(cases)).toHaveLength(1)
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
    const [cursor] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.source, "gmail"))
      .limit(1)
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

    const caseRow = (await db.select().from(cases))[0]!
    const stored = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.caseId, caseRow.id))
    expect(stored).toHaveLength(3)
    expect(stats.backfilled).toBe(2)
    expect(caseRow.status).toBe("open")
  })

  it("drops mail from ignored senders", async () => {
    await db.insert(ignoredSenders)
      .values({ email: "lena@futurebridge.vc", createdAt: new Date() })
    const api = new FakeGmailApi(FOUNDER, [unknownHuman, unknownHumanFollowup])
    const stats = await syncGmail(db, api, FOUNDER)
    expect(await db.select().from(emailMessages)).toHaveLength(0)
    expect(stats.stored).toBe(0)
  })

  it("reopens a closed case when the customer replies", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)
    const caseRow = (await db.select().from(cases))[0]!
    await db.update(cases)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(cases.id, caseRow.id))

    api.historyId = "1600"
    api.historyBatches = [{ historyId: "1600", ids: ["m_dana_3"] }]
    api.add(inboundReplyDana)
    await syncGmail(db, api, FOUNDER)

    const [updated] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseRow.id))
      .limit(1)
    expect(updated.status).toBe("open")
    expect(updated.closedAt).toBeNull()
    const systemNotes = await db
      .select()
      .from(notes)
      .where(eq(notes.caseId, caseRow.id))
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
    expect(await db.select().from(emailMessages)).toHaveLength(0)
    expect(await db.select().from(cases)).toHaveLength(0)
  })
})
