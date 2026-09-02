import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createCaseForThread } from "@/lib/crm/cases/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { cases, contacts } from "@/lib/crm/db/schema"

import { countAccountViews, listAccounts } from "./accounts"
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

  it("searches by name in either view", async () => {
    expect(namesOf((await listAccounts(db, { q: "tex" })).rows)).toEqual(["Texas Tech"])
    expect(
      namesOf((await listAccounts(db, { view: "prospective", q: "WEST" })).rows)
    ).toEqual(["Westside High"])
  })
})
