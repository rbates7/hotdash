import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/contacts/server"
import { createDb, type Db } from "@/lib/db/client"
import { contacts, organizations } from "@/lib/db/schema"

import { syncSupabase, type SupabaseSource } from "./adapter"
import type { SupabaseProfileRow } from "./mapping"

function fakeSource(rows: SupabaseProfileRow[]): SupabaseSource {
  return {
    async fetchRows(limit, offset) {
      return rows.slice(offset, offset + limit)
    },
    async close() {},
  }
}

describe("syncSupabase", () => {
  let db: Db

  beforeEach(() => {
    db = createDb(":memory:").db
    createContact(db, {
      email: "dana@acme.com",
      firstName: "Dana",
      nameSource: "stripe",
      source: "stripe",
    })
    createContact(db, {
      email: "manual@x.io",
      firstName: "Hand",
      lastName: "Edited",
      nameSource: "manual",
      source: "manual",
    })
  })

  it("enriches existing contacts with names and organizations, never creates", async () => {
    const stats = await syncSupabase(
      db,
      fakeSource([
        {
          email: "Dana@Acme.com",
          first_name: "Dana",
          last_name: "Whitfield",
          org_name: "Acme Robotics",
        },
        {
          email: "stranger@nowhere.io",
          first_name: "Not",
          last_name: "Created",
          org_name: null,
        },
        { email: null, first_name: "No", last_name: "Email", org_name: null },
      ])
    )

    expect(stats).toEqual({ rowsSeen: 3, contactsEnriched: 1 })
    expect(db.select().from(contacts).all()).toHaveLength(2)

    const dana = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "dana@acme.com"))
      .get()!
    expect(dana.lastName).toBe("Whitfield")
    expect(dana.nameSource).toBe("supabase")
    const org = db
      .select()
      .from(organizations)
      .where(eq(organizations.id, dana.organizationId!))
      .get()!
    expect(org.name).toBe("Acme Robotics")
  })

  it("never clobbers manual edits", async () => {
    const stats = await syncSupabase(
      db,
      fakeSource([
        {
          email: "manual@x.io",
          first_name: "Supabase",
          last_name: "Name",
          org_name: "Some Org",
        },
      ])
    )
    expect(stats.contactsEnriched).toBe(0)
    const contact = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "manual@x.io"))
      .get()!
    expect(contact.firstName).toBe("Hand")
    expect(contact.organizationId).toBeNull()
  })

  it("pages through large result sets", async () => {
    const rows: SupabaseProfileRow[] = Array.from({ length: 1200 }, (_, i) => ({
      email: `user${i}@bulk.io`,
      first_name: `U${i}`,
      last_name: null,
      org_name: null,
    }))
    const stats = await syncSupabase(db, fakeSource(rows))
    expect(stats.rowsSeen).toBe(1200)
  })
})
