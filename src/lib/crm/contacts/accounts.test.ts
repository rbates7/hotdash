import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createCaseForThread } from "@/lib/crm/cases/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts } from "@/lib/crm/db/schema"

import { countAccountViews, listAccounts, listAllAccounts } from "./accounts"
import { createContact, findOrCreateOrganizationByName } from "./server"

const DAY = 24 * 60 * 60 * 1000

describe("listAccounts", () => {
  let db: Db
  const namesOf = (rows: { name: string }[]) => rows.map((row) => row.name)

  beforeEach(() => {
    db = createDb(":memory:").db
    const now = Date.now()
    const texasTech = findOrCreateOrganizationByName(db, "Texas Tech")
    const clemson = findOrCreateOrganizationByName(db, "Clemson")

    const onStaff = (email: string, organizationId: string, plan: string | null) =>
      createContact(db, {
        email,
        source: "supabase",
        organizationId,
        plan,
        planStatus: plan ? "active" : null,
      })
    const typed = (email: string, affiliation: string, plan?: string, status?: string) => {
      const contact = createContact(db, {
        email,
        source: "supabase",
        plan: plan ?? null,
        planStatus: status ?? null,
      })
      db.update(contacts).set({ affiliation }).where(eq(contacts.id, contact.id)).run()
      return contact
    }

    // Staff accounts: Texas Tech has two coaches, Clemson one.
    onStaff("a@ttu.edu", texasTech.id, "5-9 seat Staff")
    const ttuB = onStaff("b@ttu.edu", texasTech.id, "5-9 seat Staff")
    onStaff("c@clemson.edu", clemson.id, null)
    // A staff coach who also typed a school: never a prospect.
    db.update(contacts).set({ affiliation: "Westside High" }).where(eq(contacts.id, ttuB.id)).run()

    // Westside High: three coaches with no staff account, spelt three ways.
    const west1 = typed("w1@x.io", "Westside High", "Monthly Webapp", "active")
    typed("w2@x.io", "westside high")
    typed("w3@x.io", "  Westside High ", "Yearly Webapp", "canceled")
    // Northgate Prep: one coach, so not a prospect.
    typed("n1@x.io", "Northgate Prep")
    // A coach who typed the name of a school that has a staff account,
    // without being on it: the account exists, this coach is not on it.
    typed("t1@x.io", "Texas Tech")

    // Cases: one open at Westside, one open and one closed at Texas Tech.
    createCaseForThread(db, {
      contactId: west1.id,
      subject: "Team plan?",
      gmailThreadId: "t-w1",
      createdAt: new Date(now - DAY),
    })
    db.update(cases).set({ lastActivityAt: new Date(now - DAY) }).run()
    const ttuOpen = createCaseForThread(db, {
      contactId: ttuB.id,
      subject: "Seats",
      gmailThreadId: "t-ttu-1",
      createdAt: new Date(now - 5 * DAY),
    })
    db.update(cases).set({ lastActivityAt: new Date(now - 5 * DAY) }).where(eq(cases.id, ttuOpen.id)).run()
    const ttuClosed = createCaseForThread(db, {
      contactId: ttuB.id,
      subject: "Old",
      gmailThreadId: "t-ttu-2",
      createdAt: new Date(now - 30 * DAY),
    })
    db.update(cases)
      .set({ status: "closed", lastActivityAt: new Date(now - 30 * DAY) })
      .where(eq(cases.id, ttuClosed.id))
      .run()
  })

  it("lists staff accounts by default, A to Z", async () => {
    const { view, rows, total } = await listAccounts(db)
    expect(view).toBe("staff")
    expect(namesOf(rows)).toEqual(["Clemson", "Texas Tech"])
    expect(total).toBe(2)
    const ttu = rows[1]!
    expect(ttu.staffCount).toBe(2)
    expect(ttu.plans).toEqual(["5-9 seat Staff"])
    expect(ttu.openCases).toBe(1)
    expect(ttu.href).toMatch(/^\/crm\/accounts\//)
  })

  it("groups coaches without a staff account by the school they typed", async () => {
    const { rows, total } = await listAccounts(db, { view: "prospective" })
    expect(total).toBe(1)
    const westside = rows[0]!
    expect(westside.name).toBe("Westside High")
    // Three spellings, one school; the staff coach who typed it is not counted.
    expect(westside.staffCount).toBe(3)
    expect(westside.plans).toEqual(["Monthly Webapp", "Yearly Webapp"])
    expect(westside.openCases).toBe(1)
    expect(westside.lastActivityAt).toBeInstanceOf(Date)
    expect(westside.href).toBe(
      "/crm/customers?affiliation=Westside%20High&standing=all&type=individual"
    )
  })

  it("counts both views under the same filters", () => {
    expect(countAccountViews(db)).toEqual({ staff: 2, prospective: 1 })
    expect(countAccountViews(db, { q: "west" })).toEqual({ staff: 0, prospective: 1 })
  })

  it("sorts by coaches, activity and open cases", async () => {
    const coaches = await listAccounts(db, { sort: "coaches" })
    expect(namesOf(coaches.rows)).toEqual(["Texas Tech", "Clemson"])
    const activity = await listAccounts(db, { sort: "activity" })
    expect(namesOf(activity.rows)).toEqual(["Texas Tech", "Clemson"])
    // Clemson has no activity at all and stays last on the way up too.
    const activityAsc = await listAccounts(db, { sort: "activity", direction: "asc" })
    expect(namesOf(activityAsc.rows)).toEqual(["Texas Tech", "Clemson"])
    const open = await listAccounts(db, { sort: "open", direction: "asc" })
    expect(namesOf(open.rows)).toEqual(["Clemson", "Texas Tech"])
  })

  it("filters by plan, size and open cases, and the totals follow", async () => {
    expect((await listAccounts(db, { plan: "5-9 seat Staff" })).total).toBe(1)
    expect((await listAccounts(db, { plan: "Monthly Webapp" })).total).toBe(0)
    expect(
      (await listAccounts(db, { view: "prospective", plan: "Monthly Webapp" })).total
    ).toBe(1)
    expect((await listAccounts(db, { minCoaches: 2 })).total).toBe(1)
    expect((await listAccounts(db, { view: "prospective", minCoaches: 5 })).total).toBe(0)
    const open = await listAccounts(db, { hasOpenCase: true })
    expect(namesOf(open.rows)).toEqual(["Texas Tech"])
    expect(open.total).toBe(1)
    expect((await listAccounts(db, { view: "prospective", hasOpenCase: true })).total).toBe(1)
  })

  it("does not count a case waiting on the customer as open", async () => {
    db.update(cases).set({ status: "waiting" }).where(eq(cases.gmailThreadId, "t-ttu-1")).run()
    const { rows } = await listAccounts(db)
    expect(rows.find((row) => row.name === "Texas Tech")!.openCases).toBe(0)
    expect((await listAccounts(db, { hasOpenCase: true })).total).toBe(0)
  })

  it("searches by name in either view", async () => {
    expect(namesOf((await listAccounts(db, { q: "tex" })).rows)).toEqual(["Texas Tech"])
    expect(
      namesOf((await listAccounts(db, { view: "prospective", q: "WEST" })).rows)
    ).toEqual(["Westside High"])
  })

  describe("listAllAccounts", () => {
    it("shows every school, including one only a single coach typed", async () => {
      const { rows, total } = listAllAccounts(db)
      expect(total).toBe(5)
      // Northgate Prep has one coach, so the Prospective view drops it and
      // it appears nowhere else in the app. This list is where it lives.
      expect(namesOf(rows)).toContain("Northgate Prep")
      expect(
        namesOf((await listAccounts(db, { view: "prospective" })).rows)
      ).not.toContain("Northgate Prep")
    })

    it("carries each row's kind, and both kinds' links", () => {
      const { rows } = listAllAccounts(db)
      const clemson = rows.find((row) => row.name === "Clemson")!
      expect(clemson.kind).toBe("staff")
      expect(clemson.href).toMatch(/^\/crm\/accounts\//)
      const northgate = rows.find((row) => row.name === "Northgate Prep")!
      expect(northgate.kind).toBe("prospective")
      expect(northgate.href).toBe(
        "/crm/customers?affiliation=Northgate%20Prep&standing=all&type=individual"
      )
    })

    it("is two rows for a school with an account and coaches who are not on it", () => {
      const { rows } = listAllAccounts(db)
      const both = rows.filter((row) => row.name === "Texas Tech")
      expect(both.map((row) => row.kind).sort()).toEqual(["prospective", "staff"])
      expect(both.find((row) => row.kind === "staff")!.staffCount).toBe(2)
      expect(both.find((row) => row.kind === "prospective")!.staffCount).toBe(1)
    })

    it("orders across both kinds, biggest first, ties by name", () => {
      expect(namesOf(listAllAccounts(db).rows)).toEqual([
        "Westside High",
        "Texas Tech",
        "Clemson",
        "Northgate Prep",
        "Texas Tech",
      ])
      expect(namesOf(listAllAccounts(db, {}, "name", "asc").rows)).toEqual([
        "Clemson",
        "Northgate Prep",
        "Texas Tech",
        "Texas Tech",
        "Westside High",
      ])
    })

    it("keeps schools with no activity last whichever way the column points", () => {
      const desc = listAllAccounts(db, {}, "activity", "desc")
      expect(namesOf(desc.rows).slice(0, 2)).toEqual(["Westside High", "Texas Tech"])
      const asc = listAllAccounts(db, {}, "activity", "asc")
      expect(namesOf(asc.rows).slice(0, 2)).toEqual(["Texas Tech", "Westside High"])
      // Either way the ones that never moved are at the bottom.
      for (const list of [desc, asc]) {
        expect(list.rows.slice(2).every((row) => row.lastActivityAt === null)).toBe(true)
      }
    })

    it("narrows on the same search and filters as the list above", () => {
      expect(namesOf(listAllAccounts(db, { q: "tex" }).rows)).toEqual([
        "Texas Tech",
        "Texas Tech",
      ])
      expect(listAllAccounts(db, { minCoaches: 2 }).total).toBe(2)
      expect(namesOf(listAllAccounts(db, { hasOpenCase: true }).rows)).toEqual([
        "Westside High",
        "Texas Tech",
      ])
      expect(namesOf(listAllAccounts(db, { plan: "Monthly Webapp" }).rows)).toEqual([
        "Westside High",
      ])
    })
  })
})
