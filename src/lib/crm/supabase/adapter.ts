import postgres from "postgres"

import { normalizeEmail } from "@/lib/crm/contacts/matching"
import {
  enrichContactName,
  findContactByEmail,
  updateContactUsage,
} from "@/lib/crm/contacts/server"
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
      // A stable ORDER BY is required: paging an unordered query can
      // repeat or skip rows, silently leaving contacts unenriched.
      // Bound parameters, not interpolation: with no args postgres.js uses
      // the simple query protocol, which permits stacked statements.
      // chlkMapping.query must stay a compile-time constant.
      const rows = await sql.unsafe(
        `select * from (${chlkMapping.query}) as profiles order by email limit $1 offset $2`,
        [limit, offset]
      )
      return rows as unknown as SupabaseProfileRow[]
    },
    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}

/** Postgres hands back Date, ISO strings, or epoch numbers depending on the
 * column type; anything unparseable is treated as absent. */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Picks the configured `extras` columns off the row for the profile card. */
function extrasFrom(row: SupabaseProfileRow) {
  const extras: Record<string, string | number | boolean | null> = {}
  for (const column of chlkMapping.extras) {
    const value = row[column]
    if (value == null) continue
    extras[column] =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : String(value)
  }
  return Object.keys(extras).length > 0 ? extras : null
}

export type SupabaseSyncStats = {
  rowsSeen: number
  contactsEnriched: number
  usageUpdated: number
}

const PAGE_SIZE = 500

// Enrich-only: Chlk users who never emailed and aren't in Stripe don't
// belong in the CRM, so this never creates contacts.
export async function syncSupabase(
  db: Db,
  source: SupabaseSource
): Promise<SupabaseSyncStats> {
  const stats: SupabaseSyncStats = {
    rowsSeen: 0,
    contactsEnriched: 0,
    usageUpdated: 0,
  }
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
        firstName: row.first_name ?? null,
        lastName: row.last_name ?? null,
        organizationName: row.org_name ?? null,
        source: "supabase",
      })
      if (enriched !== contact) stats.contactsEnriched += 1

      const usage = updateContactUsage(db, enriched, {
        appUserId: row.app_user_id == null ? null : String(row.app_user_id),
        signupAt: toDate(row.signup_at),
        lastActiveAt: toDate(row.last_active_at),
        appProfile: extrasFrom(row),
      })
      if (usage !== enriched) stats.usageUpdated += 1
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return stats
}
