import postgres from "postgres"

import { normalizeEmail } from "@/lib/crm/contacts/matching"
import {
  createContact,
  deleteOrphanOrganizations,
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
  contactsCreated: number
  contactsEnriched: number
  usageUpdated: number
  organizationsRemoved: number
}

/**
 * Which Chlk profiles become CRM contacts when they are not already there.
 *
 *   team  everyone on a staff account (the default). Accounts then list all
 *         of their people, and a staff member's first email opens a case on
 *         their team instead of landing in triage as a stranger.
 *   all   every profile with an email — thousands of individual signups
 *         included. Customers defaults to paying people, so they stay out of
 *         the way, and anyone who writes in is already known.
 *   none  fill in existing contacts only; never add one.
 */
export type CreateContactsPolicy = "team" | "all" | "none"

export type SupabaseSyncOptions = {
  createContacts?: CreateContactsPolicy
}

export function createContactsPolicyFromEnv(): CreateContactsPolicy {
  const value = process.env.SUPABASE_CREATE_CONTACTS?.trim().toLowerCase()
  return value === "all" || value === "none" ? value : "team"
}

const PAGE_SIZE = 500

// Enrich-only: Chlk users who never emailed and aren't in Stripe don't
// belong in the CRM, so this never creates contacts.
export async function syncSupabase(
  db: Db,
  source: SupabaseSource,
  options: SupabaseSyncOptions = {}
): Promise<SupabaseSyncStats> {
  const policy = options.createContacts ?? "team"
  const stats: SupabaseSyncStats = {
    rowsSeen: 0,
    contactsCreated: 0,
    contactsEnriched: 0,
    usageUpdated: 0,
    organizationsRemoved: 0,
  }
  let offset = 0
  for (;;) {
    const rows = await source.fetchRows(PAGE_SIZE, offset)
    if (rows.length === 0) break
    for (const row of rows) {
      stats.rowsSeen += 1
      if (!row.email) continue
      const email = normalizeEmail(row.email)
      let contact = findContactByEmail(db, email)
      if (!contact) {
        // org_name is the team signal from the mapping: set only for people
        // on a staff account, never from the school name they typed in.
        const onTeam = Boolean(row.org_name)
        const create = policy === "all" || (policy === "team" && onTeam)
        if (!create) continue
        contact = createContact(db, {
          email,
          firstName: row.first_name ?? null,
          lastName: row.last_name ?? null,
          nameSource: "supabase",
          source: "supabase",
        })
        stats.contactsCreated += 1
      }
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
        affiliation:
          typeof row.affiliation === "string" ? row.affiliation : null,
      })
      if (usage !== enriched) stats.usageUpdated += 1
    }
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  // Unlinking can leave accounts with nobody on them; drop those so the
  // Accounts view only ever lists a team that has someone in it.
  stats.organizationsRemoved = deleteOrphanOrganizations(db)
  return stats
}
