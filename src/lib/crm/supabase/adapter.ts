import postgres from "postgres"

import { normalizeEmail } from "@/lib/crm/contacts/matching"
import { enrichContactName, findContactByEmail } from "@/lib/crm/contacts/server"
import type { Db } from "@/lib/crm/db/client"

import { chlkMapping, type SupabaseProfileRow } from "./mapping"

export interface SupabaseSource {
  fetchRows(limit: number, offset: number): Promise<SupabaseProfileRow[]>
  close(): Promise<void>
}

function readSupabaseUrl() {
  const raw =
    process.env.CRM_SUPABASE_DB_URL?.trim() ||
    process.env.SUPABASE_READONLY_DB_URL?.trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (
      (parsed.protocol !== "postgres:" &&
        parsed.protocol !== "postgresql:") ||
      !parsed.hostname
    ) {
      return null
    }
  } catch {
    return null
  }
  return raw
}

// Direct read-only Postgres connection (Supabase session pooler string on
// IPv4-only networks — docs/SETUP.md §3). Absent env = enrichment off.
export function createSupabaseSource(): SupabaseSource | null {
  const url = readSupabaseUrl()
  if (!url) return null
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 1,
    onnotice: () => {},
    connection: { application_name: "hotdash-crm-enrichment" },
  })
  return {
    async fetchRows(limit, offset) {
      const rows = await sql.begin("read only", async (tx) => {
        await tx.unsafe("set local statement_timeout = 10000")
        return tx.unsafe(
          `select * from (${chlkMapping.query}) as profiles limit $1 offset $2`,
          [limit, offset]
        )
      })
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
      const contact = await findContactByEmail(db, normalizeEmail(row.email))
      if (!contact) continue
      const enriched = await enrichContactName(db, contact, {
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
