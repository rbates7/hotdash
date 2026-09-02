/**
 * Prints the shape of your Supabase database so the enrichment query in
 * src/lib/crm/supabase/mapping.ts can be written against the real schema.
 *
 *   pnpm crm:schema
 *
 * Reads column names only — never row data — so the output is safe to share
 * while your connection string and your users' details are not.
 */
import { loadEnvLocal } from "./load-env"
import postgres from "postgres"

loadEnvLocal()

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set. Add a read-only Postgres URL to .env.local first."
  )
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })

async function main() {
  type Column = {
    table_schema: string
    table_name: string
    column_name: string
    data_type: string
  }
  type Table = { schema: string; name: string; readable: boolean }

  // Columns worth spotting: these are what the mapping needs to fill in.
  const INTERESTING =
    /^(id|uuid|email|.*_email|first_?name|last_?name|full_?name|display_?name|name|org.*|team.*|school.*|created_?at|inserted_?at|signup.*|last_?(seen|active|login|sign_?in).*|role|plan.*|seats?|raw_user_meta_data)$/i

  try {
    // Every table in the database, from the catalog — which is readable by
    // any role — with whether *this* role may select from it. This is what
    // shows where the app's data actually lives when a grant missed it.
    const all = await sql<Table[]>`
      select n.nspname as schema,
             c.relname as name,
             has_table_privilege(c.oid, 'SELECT') as readable
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm')
        and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'extensions', 'graphql', 'graphql_public', 'net', 'pgsodium', 'pgsodium_masks', 'realtime', 'supabase_functions', 'supabase_migrations', 'vault', 'cron', 'pgbouncer')
      order by n.nspname, c.relname
    `

    const columns = await sql<Column[]>`
      select table_schema, table_name, column_name, data_type
      from information_schema.columns
      where table_schema not in ('pg_catalog', 'information_schema')
        and table_schema not like 'pg_%'
      order by table_schema, table_name, ordinal_position
    `
    const columnsFor = new Map<string, Column[]>()
    for (const column of columns) {
      const key = `${column.table_schema}.${column.table_name}`
      columnsFor.set(key, [...(columnsFor.get(key) ?? []), column])
    }

    const bySchema = new Map<string, Table[]>()
    for (const table of all) {
      bySchema.set(table.schema, [...(bySchema.get(table.schema) ?? []), table])
    }

    console.log(`\n${all.length} table${all.length === 1 ? "" : "s"} across ${bySchema.size} schema${bySchema.size === 1 ? "" : "s"}\n`)

    const withEmail: string[] = []
    const unreadable: string[] = []
    for (const [schema, tables] of bySchema) {
      console.log(`  ${schema}/`)
      for (const table of tables) {
        const key = `${schema}.${table.name}`
        const cols = columnsFor.get(key) ?? []
        if (!table.readable) {
          unreadable.push(key)
          console.log(`    ${table.name}   (no access yet)`)
          continue
        }
        const hasEmail = cols.some((c) => /email/i.test(c.column_name))
        if (hasEmail) withEmail.push(key)
        console.log(`    ${table.name}${hasEmail ? "   ← has email" : ""}`)
        // Readable app tables get every column: deciding how membership or
        // plans are recorded needs the whole shape, not a guess at the
        // interesting bits. Wide system tables are summarised.
        const shown =
          cols.length <= 40 ? cols : cols.filter((c) => INTERESTING.test(c.column_name))
        console.log(
          `      ${cols.length} columns${cols.length > 40 ? " (notable only)" : ""}: ` +
            shown.map((c) => `${c.column_name} (${c.data_type})`).join(", ")
        )
      }
      console.log()
    }

    if (withEmail.length > 0) {
      console.log(`Readable tables with an email column: ${withEmail.join(", ")}\n`)
    }
    // auth holds session and MFA secrets and storage holds uploaded files;
    // the CRM has no business in either, so never suggest opening them.
    const NEVER_SUGGEST = new Set(["auth", "storage"])
    const suggestable = unreadable.filter(
      (t) => !NEVER_SUGGEST.has(t.split(".")[0]!)
    )
    if (suggestable.length > 0) {
      const schemas = [...new Set(suggestable.map((t) => t.split(".")[0]))]
      console.log(
        `${suggestable.length} app table${suggestable.length === 1 ? "" : "s"} this role cannot read yet. To grant access, run in the Supabase SQL Editor:\n`
      )
      for (const schema of schemas) {
        console.log(`  grant usage on schema ${schema} to crm_reader;`)
        console.log(`  grant select on all tables in schema ${schema} to crm_reader;`)
      }
      console.log()
    }
  } finally {
    await sql.end()
  }
}

main().catch((error: unknown) => {
  // A stack trace here is noise: the useful part is which host or key failed.
  const message =
    error instanceof Error ? error.message : String(error)
  console.error(`\n${message}\n`)
  process.exit(1)
})
