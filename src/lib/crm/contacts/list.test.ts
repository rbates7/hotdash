import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createCaseForThread } from "@/lib/crm/cases/server"
import { NotFoundError } from "@/lib/crm/core/errors"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts, emailMessages, notes } from "@/lib/crm/db/schema"

import {
  createContact,
  findOrCreateOrganizationByName,
  listContacts,
  listPlanLabels,
  setContactReachedOut,
} from "./server"

const DAY = 24 * 60 * 60 * 1000

describe("listContacts sorting and filtering", () => {
  let db: Db
  const emailsOf = (rows: { contact: { email: string } }[]) =>
    rows.map((row) => row.contact.email)

  beforeEach(() => {
    db = createDb(":memory:").db
    const now = Date.now()
    const texasTech = findOrCreateOrganizationByName(db, "Texas Tech")

    // Zara: paying individual, started three days ago; one closed case.
    const zara = createContact(db, {
      email: "zara@acme.com",
      firstName: "Zara",
      lastName: "Ali",
      nameSource: "stripe",
      source: "stripe",
      stripeCustomerId: "cus_zara",
      plan: "Monthly Webapp",
      planStatus: "active",
    })
    db.update(contacts)
      .set({ planStartedAt: new Date(now - 3 * DAY) })
      .where(eq(contacts.id, zara.id))
      .run()

    // Adam: never paid, typed in a school, wrote in yesterday and is
    // still waiting on an answer.
    const adam = createContact(db, {
      email: "adam@westhigh.edu",
      firstName: "Adam",
      lastName: "Brooks",
      nameSource: "gmail",
      source: "gmail",
    })
    db.update(contacts)
      .set({ affiliation: "Westside High" })
      .where(eq(contacts.id, adam.id))
      .run()

    // Bea: on a staff account, paying for forty days.
    const bea = createContact(db, {
      email: "bea@ttu.edu",
      firstName: "Bea",
      lastName: "Cruz",
      nameSource: "supabase",
      source: "supabase",
      organizationId: texasTech.id,
      plan: "2-4 seat Staff",
      planStatus: "active",
    })
    db.update(contacts)
      .set({ planStartedAt: new Date(now - 40 * DAY) })
      .where(eq(contacts.id, bea.id))
      .run()

    // Cal: canceled two days ago; typed the same school as Adam, untidily.
    const cal = createContact(db, {
      email: "cal@x.io",
      firstName: "Cal",
      lastName: "Dunn",
      nameSource: "stripe",
      source: "stripe",
      stripeCustomerId: "cus_cal",
      plan: "Yearly Webapp",
      planStatus: "canceled",
    })
    db.update(contacts)
      .set({
        planStartedAt: new Date(now - 400 * DAY),
        planEndedAt: new Date(now - 2 * DAY),
        affiliation: "  westside high ",
      })
      .where(eq(contacts.id, cal.id))
      .run()

    // Dee: trialing, paying starts in five days; no name at all.
    const dee = createContact(db, {
      email: "dee@x.io",
      source: "stripe",
      stripeCustomerId: "cus_dee",
      plan: "Monthly Webapp",
      planStatus: "trialing",
    })
    db.update(contacts)
      .set({ planStartedAt: new Date(now + 5 * DAY) })
      .where(eq(contacts.id, dee.id))
      .run()

    const adamCase = createCaseForThread(db, {
      contactId: adam.id,
      subject: "Team plan?",
      gmailThreadId: "t-adam",
      createdAt: new Date(now - DAY),
    })
    db.insert(emailMessages)
      .values({
        id: "m-adam",
        gmailMessageId: "gm-adam",
        gmailThreadId: "t-adam",
        caseId: adamCase.id,
        direction: "inbound",
        fromEmail: "adam@westhigh.edu",
        toEmails: ["info@chlkapp.com"],
        ccEmails: [],
        attachments: [],
        sentAt: new Date(now - DAY),
        createdAt: new Date(now - DAY),
      })
      .run()
    const zaraCase = createCaseForThread(db, {
      contactId: zara.id,
      subject: "Receipt",
      gmailThreadId: "t-zara",
      createdAt: new Date(now - 10 * DAY),
    })
    db.update(cases)
      .set({ status: "closed", closedAt: new Date(now - 9 * DAY) })
      .where(eq(cases.id, zaraCase.id))
      .run()
  })

  it("lists names A to Z by default, nameless people last", async () => {
    const { rows } = await listContacts(db, { standing: "all" })
    expect(emailsOf(rows)).toEqual([
      "adam@westhigh.edu",
      "bea@ttu.edu",
      "cal@x.io",
      "zara@acme.com",
      "dee@x.io",
    ])
  })

  it("keeps nameless people last when the name sort is reversed", async () => {
    const { rows } = await listContacts(db, {
      standing: "all",
      sort: "name",
      direction: "desc",
    })
    expect(emailsOf(rows)).toEqual([
      "zara@acme.com",
      "cal@x.io",
      "bea@ttu.edu",
      "adam@westhigh.edu",
      "dee@x.io",
    ])
  })

  it("sorts by plan both ways with no-plan people last", async () => {
    const asc = await listContacts(db, { standing: "all", sort: "plan" })
    expect(emailsOf(asc.rows)).toEqual([
      "bea@ttu.edu",
      "dee@x.io",
      "zara@acme.com",
      "cal@x.io",
      "adam@westhigh.edu",
    ])
    const desc = await listContacts(db, {
      standing: "all",
      sort: "plan",
      direction: "desc",
    })
    expect(emailsOf(desc.rows)).toEqual([
      "cal@x.io",
      "dee@x.io",
      "zara@acme.com",
      "bea@ttu.edu",
      "adam@westhigh.edu",
    ])
  })

  it("sorts by the date shown: when paying started, or when it ended", async () => {
    const desc = await listContacts(db, { standing: "all", sort: "date" })
    expect(emailsOf(desc.rows)).toEqual([
      "dee@x.io", // starts in five days
      "cal@x.io", // ended two days ago
      "zara@acme.com", // started three days ago
      "bea@ttu.edu", // started forty days ago
      "adam@westhigh.edu", // no plan
    ])
    const asc = await listContacts(db, {
      standing: "all",
      sort: "date",
      direction: "asc",
    })
    expect(emailsOf(asc.rows)).toEqual([
      "bea@ttu.edu",
      "zara@acme.com",
      "cal@x.io",
      "dee@x.io",
      "adam@westhigh.edu",
    ])
  })

  it("sorts by last inbound, open cases and account, silent people last", async () => {
    const inbound = await listContacts(db, { standing: "all", sort: "lastInbound" })
    expect(emailsOf(inbound.rows)[0]).toBe("adam@westhigh.edu")
    expect(emailsOf(inbound.rows).slice(1)).toEqual([
      "bea@ttu.edu",
      "cal@x.io",
      "dee@x.io",
      "zara@acme.com",
    ])

    const open = await listContacts(db, { standing: "all", sort: "open" })
    expect(emailsOf(open.rows)[0]).toBe("adam@westhigh.edu")

    const account = await listContacts(db, { standing: "all", sort: "account" })
    expect(emailsOf(account.rows)[0]).toBe("bea@ttu.edu")
    expect(emailsOf(account.rows).slice(1)).toEqual([
      "adam@westhigh.edu",
      "cal@x.io",
      "dee@x.io",
      "zara@acme.com",
    ])
  })

  it("filters by plan", async () => {
    const { rows, total } = await listContacts(db, { plan: "Monthly Webapp" })
    expect(emailsOf(rows).sort()).toEqual(["dee@x.io", "zara@acme.com"])
    expect(total).toBe(2)
  })

  it("filters by status; canceled people only appear once standing is all", async () => {
    const all = await listContacts(db, { standing: "all", status: "canceled" })
    expect(emailsOf(all.rows)).toEqual(["cal@x.io"])
    const active = await listContacts(db, { standing: "active", status: "canceled" })
    expect(active.rows).toHaveLength(0)
    expect(active.total).toBe(0)
    // The chips say what each would show under the other filters.
    expect(active.standingCounts).toEqual({ active: 0, all: 1 })
  })

  it("started: within the window, and not in the future", async () => {
    expect(emailsOf((await listContacts(db, { started: "7d" })).rows)).toEqual([
      "zara@acme.com",
    ])
    expect(emailsOf((await listContacts(db, { started: "90d" })).rows)).toEqual([
      "bea@ttu.edu",
      "zara@acme.com",
    ])
  })

  it("ended: within the window", async () => {
    expect(
      emailsOf((await listContacts(db, { standing: "all", ended: "7d" })).rows)
    ).toEqual(["cal@x.io"])
    expect((await listContacts(db, { standing: "active", ended: "7d" })).rows).toHaveLength(0)
  })

  it("hasOpenCase keeps people with a case that is not closed", async () => {
    const { rows } = await listContacts(db, { standing: "all", hasOpenCase: true })
    expect(emailsOf(rows)).toEqual(["adam@westhigh.edu"])
    expect((await listContacts(db, { standing: "active", hasOpenCase: true })).total).toBe(0)
  })

  it("affiliation matches ignoring case and outer spaces", async () => {
    const { rows, counts } = await listContacts(db, {
      standing: "all",
      affiliation: "WESTSIDE HIGH",
    })
    expect(emailsOf(rows)).toEqual(["adam@westhigh.edu", "cal@x.io"])
    expect(counts).toEqual({ all: 2, individual: 2, team: 0 })
  })

  it("type counts follow the other filters", async () => {
    const { counts } = await listContacts(db, { standing: "all", plan: "2-4 seat Staff" })
    expect(counts).toEqual({ all: 1, individual: 0, team: 1 })
  })

  it("lists every plan label once, sorted", () => {
    expect(listPlanLabels(db)).toEqual([
      "2-4 seat Staff",
      "Monthly Webapp",
      "Yearly Webapp",
    ])
  })

  it("records and forgets that you reached out", () => {
    const zara = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "zara@acme.com"))
      .get()!
    expect(setContactReachedOut(db, zara.id, true).reachedOutAt).toBeInstanceOf(Date)
    expect(setContactReachedOut(db, zara.id, false).reachedOutAt).toBeNull()
    expect(() => setContactReachedOut(db, "nope", true)).toThrow(NotFoundError)
  })
})

describe("listContacts last contacted", () => {
  let db: Db
  const emailsOf = (rows: { contact: { email: string } }[]) =>
    rows.map((row) => row.contact.email)

  beforeEach(() => {
    db = createDb(":memory:").db
    const now = Date.now()
    const make = (email: string, firstName: string) =>
      createContact(db, {
        email,
        firstName,
        source: "stripe",
        plan: "Monthly Webapp",
        planStatus: "active",
      })
    const dana = make("dana@acme.com", "Dana")
    const eve = make("eve@x.io", "Eve")
    const fay = make("fay@x.io", "Fay")
    const gus = make("gus@x.io", "Gus")
    make("hal@x.io", "Hal")

    const send = (id: string, contactId: string, caseId: string | null, thread: string, sentAt: Date) =>
      db
        .insert(emailMessages)
        .values({
          id,
          gmailMessageId: `gm-${id}`,
          gmailThreadId: thread,
          caseId,
          contactId,
          direction: "outbound",
          fromEmail: "info@chlkapp.com",
          toEmails: ["x@y.z"],
          ccEmails: [],
          attachments: [],
          sentAt,
          createdAt: sentAt,
        })
        .run()

    // Dana: you replied on her case yesterday.
    const danaCase = createCaseForThread(db, {
      contactId: dana.id,
      subject: "Seats",
      gmailThreadId: "t-dana",
      createdAt: new Date(now - 2 * DAY),
    })
    send("m-dana", dana.id, danaCase.id, "t-dana", new Date(now - DAY))
    // Eve: mail you started forty days ago, no case.
    send("m-eve", eve.id, null, "t-eve", new Date(now - 40 * DAY))
    // Fay: a call you logged three days ago.
    db.insert(notes)
      .values({
        id: "n-fay",
        caseId: null,
        contactId: fay.id,
        kind: "call",
        body: "Talked through the staff plan",
        createdAt: new Date(now - 3 * DAY),
      })
      .run()
    // Gus: only the tick, ten days ago.
    db.update(contacts)
      .set({ reachedOutAt: new Date(now - 10 * DAY) })
      .where(eq(contacts.id, gus.id))
      .run()
  })

  it("knows when you last reached them, by email, call or tick", async () => {
    const { rows } = await listContacts(db, { sort: "lastContact" })
    expect(emailsOf(rows)).toEqual([
      "dana@acme.com",
      "fay@x.io",
      "gus@x.io",
      "eve@x.io",
      "hal@x.io",
    ])
    expect(rows[0]!.lastOutboundAt).toBeInstanceOf(Date)
    expect(rows[1]!.lastCallAt).toBeInstanceOf(Date)
    expect(rows[2]!.lastContactedAt).toEqual(rows[2]!.contact.reachedOutAt)
    expect(rows[4]!.lastContactedAt).toBeNull()

    const asc = await listContacts(db, { sort: "lastContact", direction: "asc" })
    expect(emailsOf(asc.rows)).toEqual([
      "eve@x.io",
      "gus@x.io",
      "fay@x.io",
      "dana@acme.com",
      "hal@x.io",
    ])
  })

  it("filters by never contacted, or contacted within a window", async () => {
    expect(emailsOf((await listContacts(db, { contacted: "never" })).rows)).toEqual(["hal@x.io"])
    expect(emailsOf((await listContacts(db, { contacted: "7d" })).rows)).toEqual([
      "dana@acme.com",
      "fay@x.io",
    ])
    const month = await listContacts(db, { contacted: "30d" })
    expect(emailsOf(month.rows)).toEqual(["dana@acme.com", "fay@x.io", "gus@x.io"])
    expect(month.total).toBe(3)
    expect((await listContacts(db, { contacted: "90d" })).total).toBe(4)
  })
})
