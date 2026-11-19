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
import { getSetting } from "@/lib/crm/settings/server"

import { GmailApiError } from "./errors"
import { FakeGmailApi, gaxiosNotFoundError } from "./fake-api"
import {
  catchUpGmail,
  gmailCatchUpListQuery,
  gmailFullSyncListQuery,
  GmailNeverSyncedError,
  syncGmail,
} from "./sync"

async function gmailState(db: Db) {
  const [row] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, "gmail"))
    .limit(1)
  return row
}

describe("gmailFullSyncListQuery", () => {
  it("supports relative windows and Gmail after: dates", () => {
    expect(gmailFullSyncListQuery("30d")).toBe("-in:chat newer_than:30d")
    expect(gmailFullSyncListQuery("after:2026/07/01")).toBe(
      "-in:chat after:2026/07/01"
    )
  })

  it("builds the catch-up query from epoch seconds", () => {
    expect(gmailCatchUpListQuery(1761680400.9)).toBe("-in:chat after:1761680400")
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
  it("skips a message Gmail no longer has (404) and still advances the cursor", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)

    // History lists a deleted draft next to a real new reply; the draft's
    // users.messages.get answers 404 exactly like production.
    api.add(inboundReplyDana)
    api.deletedIds.add("m_deleted_draft")
    api.historyId = "1700"
    api.historyBatches = [
      { historyId: "1700", ids: ["m_deleted_draft", "m_dana_3"] },
    ]
    const stats = await syncGmail(db, api, FOUNDER)

    expect(stats.skippedMissing).toBe(1)
    expect(stats.fetched).toBe(1)
    expect(stats.stored).toBe(1)
    expect((await gmailState(db))?.cursor).toBe("1700")
  })

  it("still fails the run for errors other than 404", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    api.getMessage = async () => {
      throw new GmailApiError(
        "users.messages.get",
        Object.assign(new Error("Backend Error"), { status: 500 })
      )
    }
    await expect(syncGmail(db, api, FOUNDER)).rejects.toThrow(
      "Gmail users.messages.get failed (500): Backend Error"
    )
    expect(await gmailState(db)).toBeUndefined()
  })

  it("treats a wrapped gaxios 404 from messages.get as missing, not fatal", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    api.deletedIds.add("m_gone")
    const realGetMessage = api.getMessage.bind(api)
    api.getMessage = async (id) => {
      try {
        return await realGetMessage(id)
      } catch (error) {
        throw new GmailApiError("users.messages.get", error)
      }
    }
    const stats = await syncGmail(db, api, FOUNDER)
    expect(stats.skippedMissing).toBe(1)
    expect((await gmailState(db))?.cursor).toBe("1000")
  })

  it("after the cursor expires, resumes the backfill from its saved page instead of restarting", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await syncGmail(db, api, FOUNDER)

    api.add(inboundReplyDana)
    api.add(unknownHuman)
    api.pageSize = 1
    api.expireHistoryOnce = true
    api.historyId = "3000"

    const first = await syncGmail(db, api, FOUNDER)
    expect(first.backfillPending).toBe(1)
    // The expired cursor is dropped right away, so the next run resumes.
    expect((await gmailState(db))?.cursor).toBeNull()
    expect(await getSetting(db, "gmail_backfill_page_token")).toBe("1")

    const second = await syncGmail(db, api, FOUNDER)
    expect(second.backfillPending).toBe(1)
    expect(await getSetting(db, "gmail_backfill_page_token")).toBe("2")

    const third = await syncGmail(db, api, FOUNDER)
    expect(third.backfillPending).toBeUndefined()
    expect(api.calls.listHistory).toBe(1)
    expect(api.calls.listMessageIds).toBe(4)
    expect((await gmailState(db))?.cursor).toBe("3000")
    expect(await getSetting(db, "gmail_backfill_page_token")).toBeNull()
  })

  it("keeps the backfill page token when a run fails mid-page", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana, unknownHuman])
    api.pageSize = 1
    const realGetMessage = api.getMessage.bind(api)
    let failNext = false
    api.getMessage = async (id) => {
      if (failNext) throw new Error("network blip")
      return realGetMessage(id)
    }
    await syncGmail(db, api, FOUNDER)
    expect(await getSetting(db, "gmail_backfill_page_token")).toBe("1")

    failNext = true
    await expect(syncGmail(db, api, FOUNDER)).rejects.toThrow("network blip")
    // Page two was not stored, so its token was not advanced past.
    expect(await getSetting(db, "gmail_backfill_page_token")).toBe("1")
  })
})

describe("catchUpGmail", () => {
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

  it("refuses when Gmail never synced", async () => {
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    await expect(catchUpGmail(db, api, FOUNDER)).rejects.toBeInstanceOf(
      GmailNeverSyncedError
    )
    expect(api.calls.listMessageIds).toBe(0)
  })

  it("searches after the last success, skips missing mail, and resets the cursor", async () => {
    const lastSyncedAt = new Date("2026-10-28T19:40:00Z")
    await db.insert(syncState).values({
      source: "gmail",
      cursor: "stale-21-days",
      lastSyncedAt,
      updatedAt: lastSyncedAt,
    })
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana, unknownHuman])
    api.deletedIds.add("m_deleted_draft")
    api.historyId = "9000"

    const stats = await catchUpGmail(db, api, FOUNDER)

    const expectedAfter = Math.floor(lastSyncedAt.getTime() / 1000) - 3600
    expect(api.listQueries).toEqual([`-in:chat after:${expectedAfter}`])
    expect(api.calls.listHistory).toBe(0)
    expect(stats.fetched).toBe(2)
    expect(stats.skippedMissing).toBe(1)
    expect(stats.casesCreated).toBe(1)
    expect(stats.triaged).toBe(1)
    expect(stats.catchUpPending).toBeUndefined()

    const state = await gmailState(db)
    expect(state?.cursor).toBe("9000")
    expect(state!.lastSyncedAt!.getTime()).toBeGreaterThan(lastSyncedAt.getTime())
    expect(await getSetting(db, "gmail_catchup_after")).toBeNull()

    // Regular syncs carry on from the new cursor.
    api.historyBatches = []
    await syncGmail(db, api, FOUNDER)
    expect(api.calls.listHistory).toBe(1)
  })

  it("stops at the time budget and resumes on the next click", async () => {
    const lastSyncedAt = new Date("2026-10-28T19:40:00Z")
    await db.insert(syncState).values({
      source: "gmail",
      cursor: "stale",
      lastSyncedAt,
      updatedAt: lastSyncedAt,
    })
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana, unknownHuman])
    api.pageSize = 1
    api.historyId = "9100"

    const first = await catchUpGmail(db, api, FOUNDER, { timeBudgetMs: 0 })
    expect(first.catchUpPending).toBe(1)
    expect((await gmailState(db))?.cursor).toBe("stale")

    // Mailbox moves on; the resumed catch-up keeps its original start point.
    api.historyId = "9999"
    const second = await catchUpGmail(db, api, FOUNDER, { timeBudgetMs: 0 })
    expect(second.catchUpPending).toBeUndefined()
    expect(api.calls.getProfile).toBe(1)
    expect(new Set(api.listQueries).size).toBe(1)
    expect((await gmailState(db))?.cursor).toBe("9100")
    expect(await db.select().from(emailMessages)).toHaveLength(2)
  })

  it("propagates real Gmail failures", async () => {
    await db.insert(syncState).values({
      source: "gmail",
      cursor: "stale",
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    const api = new FakeGmailApi(FOUNDER, [inboundPlainDana])
    api.listMessageIds = async () => {
      throw new GmailApiError(
        "users.messages.list",
        gaxiosNotFoundError("https://gmail.googleapis.com/gmail/v1/users/me/messages")
      )
    }
    await expect(catchUpGmail(db, api, FOUNDER)).rejects.toThrow(
      "Gmail users.messages.list failed (404)"
    )
    expect((await gmailState(db))?.cursor).toBe("stale")
  })
})
