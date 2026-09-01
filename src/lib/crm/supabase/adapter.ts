import postgres from "postgres"

import { normalizeEmail } from "@/lib/crm/contacts/matching"
import { enrichContactName, findContactByEmail } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"

import { chlkMapping, type SupabaseProfileRow } from "./mapping"

export interface SupabaseSource {
  fetchRows(limit: number, offset: number): Promise<SupabaseProfileRow[]>
  close(): Promise<void>
}

// Direct read-only Postgres connection (Supabase session pooler string on
// IPv4-only networks — docs/SETUP.md §3). Absent env = enrichment off.
export function createSupabaseSource(): SupabaseSource | null {
  const url = process.env.SUPABASE_DB_URL
  if (!url) return null
  const sql = postgres(url, { max: 1, prepare: false })
  return {
    async fetchRows(limit, offset) {
      const rows = await sql.unsafe(
        `select * from (${chlkMapping.query}) as profiles limit ${limit} offset ${offset}`
      )
      return rows as unknown as SupabaseProfileRow[]
    },
    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}

export type SupabaseSyncStats = {
  rowsSeen: number
  contactsEnriched: number
}

const PAGE_SIZE = 500

// Enrich-only: Chlk users who never emailed and aren't in Stripe don't
// belong in the CRM, so this never creates contacts.
export async function syncSupabase(
  db: Db,
  source: SupabaseSource
): Promise<SupabaseSyncStats> {
  const stats: SupabaseSyncStats = { rowsSeen: 0, contactsEnriched: 0 }
  let offset = 0
  for (;;) {
    const rows = await source.fetchRows(PAGE_SIZE, offset)
    if (rows.length === 0) break
    for (const row of rows) {
      stats.rowsSeen += 1
      if (!row.email) continue
      const contact = findContactByEmail(db, normalizeEmail(row.email))
      if (!contact) continue
      const enriched = enrichContactName(db, contact, {
        firstName: row.first_name,
        lastName: row.last_name,
        organizationName: row.org_name,
        source: "supabase",
      })
      if (enriched !== contact) stats.contactsEnriched += 1
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return stats
}
