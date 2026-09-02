/**
 * What the CRM's local database currently holds — read-only, no side
 * effects, safe to run while the server is up.
 *
 *   pnpm crm:status
 *
 * Answers the questions that otherwise take a screenshot and a guess: did
 * the latest migration apply, what is linked to what, when did each source
 * last run and what did it say, and is automatic sync paused.
 */
import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

import { loadEnvLocal } from "./load-env"

loadEnvLocal()

const file = path.resolve(process.env.DATABASE_PATH ?? "./data/crm.db")
if (!fs.existsSync(file)) {
  console.error(`No database at ${file}`)
  process.exit(1)
}
const db = new Database(file, { readonly: true })

type Row = Record<string, unknown>
function rows(sql: string): Row[] {
  try {
    return db.prepare(sql).all() as Row[]
  } catch (error) {
    return [{ error: error instanceof Error ? error.message : String(error) }]
  }
}
function one(sql: string): Row {
  return rows(sql)[0] ?? {}
}
function section(title: string) {
  console.log(`\n${title}`)
}
function line(label: string, value: unknown) {
  console.log(`  ${label.padEnd(26)} ${value == null ? "—" : String(value)}`)
}
function when(ms: unknown) {
  return typeof ms === "number" ? new Date(ms).toLocaleString() : "—"
}

console.log(`\nCRM status  (${file})`)

section("Migrations")
const migrations = rows(
  "select id, created_at from __drizzle_migrations order by id"
)
line("applied", migrations.length)
const hasOrgSource = rows("pragma table_info(contacts)").some(
  (c) => c.name === "organization_source"
)
line("organization_source col", hasOrgSource ? "present" : "MISSING — server is on an older build")

section("Contacts")
line("total", one("select count(*) n from contacts").n)
line("with a name", one("select count(*) n from contacts where coalesce(first_name,'') <> '' or coalesce(last_name,'') <> ''").n)
line("linked to an account", one("select count(*) n from contacts where organization_id is not null").n)
if (hasOrgSource) {
  for (const r of rows(
    "select coalesce(organization_source,'(unattributed)') src, count(*) n from contacts where organization_id is not null group by 1 order by 2 desc"
  )) {
    line(`  linked by ${r.src}`, r.n)
  }
}
line("paying (active/trial/past_due)", one("select count(*) n from contacts where plan_status in ('active','trialing','past_due')").n)

section("Accounts (organizations)")
line("total", one("select count(*) n from organizations").n)
line("with nobody on them", one("select count(*) n from organizations o where not exists (select 1 from contacts c where c.organization_id = o.id)").n)

section("Cases")
line("total", one("select count(*) n from cases").n)
line("needing a reply", one("select count(*) n from cases where last_inbound_at is not null and (last_outbound_at is null or last_inbound_at > last_outbound_at)").n)
line("triage pending", one("select count(*) n from email_messages where case_id is null and triage_state = 'pending'").n)

section("Sync")
const paused = one("select value from settings where key = 'sync_paused'")
line("automatic sync", paused.value === "1" || paused.value === "true" ? "PAUSED" : "on")
for (const source of ["gmail", "stripe", "supabase"]) {
  const last = rows(
    `select status, started_at, finished_at, message, stats from sync_runs where source = '${source}' order by started_at desc limit 1`
  )[0]
  if (!last || last.error) {
    line(source, last?.error ?? "never ran")
    continue
  }
  const stats = typeof last.stats === "string" ? last.stats : ""
  line(source, `${last.status}  ${when(last.started_at)}  ${last.message ?? stats}`)
}
console.log()
