import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { createContact } from "@/lib/crm/contacts/server"
import { createDb, type Db } from "@/lib/crm/db/client"
import { contacts, organizations } from "@/lib/crm/db/schema"

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

    expect(stats).toEqual({ rowsSeen: 3, contactsEnriched: 1, usageUpdated: 0 })
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

  it("never clobbers a manually edited name, but still links the account", async () => {
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
    expect(stats.usageUpdated).toBe(0)

    const contact = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "manual@x.io"))
      .get()!
    // The hand-typed name wins over the app database, as always...
    expect(contact.firstName).toBe("Hand")
    expect(contact.lastName).toBe("Edited")
    // ...but organization is not part of that contest: editing someone's
    // name must not permanently stop their account from being linked.
    expect(contact.organizationId).not.toBeNull()
    const org = db
      .select()
      .from(organizations)
      .where(eq(organizations.id, contact.organizationId!))
      .get()!
    expect(org.name).toBe("Some Org")
  })

  it("leaves an already-linked account alone", async () => {
    await syncSupabase(db, fakeSource([{ email: "manual@x.io", org_name: "First Org" }]))
    const before = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "manual@x.io"))
      .get()!
    await syncSupabase(db, fakeSource([{ email: "manual@x.io", org_name: "Second Org" }]))
    const after = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "manual@x.io"))
      .get()!
    expect(after.organizationId).toBe(before.organizationId)
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

  it("mirrors product usage and tolerates missing or unparseable values", async () => {
    const stats = await syncSupabase(
      db,
      fakeSource([
        {
          email: "dana@acme.com",
          app_user_id: 8812,
          signup_at: "2025-06-01T00:00:00Z",
          last_active_at: new Date("2026-08-30T09:00:00Z"),
        },
        // No usage columns at all — the mapping simply didn't select them.
        { email: "manual@x.io", first_name: null },
      ])
    )
    expect(stats.usageUpdated).toBe(1)

    const dana = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "dana@acme.com"))
      .get()!
    expect(dana.appUserId).toBe("8812")
    expect(dana.signupAt?.toISOString()).toBe("2025-06-01T00:00:00.000Z")
    expect(dana.lastActiveAt?.toISOString()).toBe("2026-08-30T09:00:00.000Z")

    const untouched = db
      .select()
      .from(contacts)
      .where(eq(contacts.email, "manual@x.io"))
      .get()!
    expect(untouched.appUserId).toBeNull()
    expect(untouched.signupAt).toBeNull()
  })

  it("is idempotent on repeated usage syncs", async () => {
    const rows = [
      { email: "dana@acme.com", app_user_id: "abc", signup_at: "2025-06-01T00:00:00Z" },
    ]
    await syncSupabase(db, fakeSource(rows))
    const second = await syncSupabase(db, fakeSource(rows))
    expect(second.usageUpdated).toBe(0)
  })
})
