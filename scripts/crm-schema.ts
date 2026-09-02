/**
 * Prints the shape of your Supabase database so the enrichment query in
 * src/lib/crm/supabase/mapping.ts can be written against the real schema.
 *
 *   pnpm crm:schema
 *
 * Reads column names only — never row data — so the output is safe to share
 * while your connection string and your users' details are not.
 */
import postgres from "postgres"

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set. Add a read-only Postgres URL to .env.local first."
  )
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })

type Column = { table_schema: string; table_name: string; column_name: string; data_type: string }

// Columns worth spotting: these are what the mapping needs to fill in.
const INTERESTING =
  /^(id|uuid|email|.*_email|first_?name|last_?name|full_?name|display_?name|name|org.*|team.*|school.*|created_?at|inserted_?at|signup.*|last_?(seen|active|login).*|role|plan.*|seats?)$/i

try {
  const columns = await sql<Column[]>`
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
      and table_schema not like 'pg_%'
    order by table_schema, table_name, ordinal_position
  `

  const tables = new Map<string, Column[]>()
  for (const column of columns) {
    const key = `${column.table_schema}.${column.table_name}`
    tables.set(key, [...(tables.get(key) ?? []), column])
  }

  if (tables.size === 0) {
    console.log("\nNo tables visible to this role.\n")
  }

  // Tables carrying an email column are the ones enrichment can join on.
  const withEmail: string[] = []
  console.log(`\n${tables.size} table${tables.size === 1 ? "" : "s"}\n`)
  for (const [table, cols] of tables) {
    const hasEmail = cols.some((c) => /email/i.test(c.column_name))
    if (hasEmail) withEmail.push(table)
    const notable = cols.filter((c) => INTERESTING.test(c.column_name))
    console.log(`  ${table}${hasEmail ? "   ← has email" : ""}`)
    console.log(
      `    ${cols.length} columns${notable.length ? ": " + notable.map((c) => `${c.column_name} (${c.data_type})`).join(", ") : ""}`
    )
    console.log()
  }

  if (withEmail.length > 0) {
    console.log(
      `Tables the CRM could match contacts against: ${withEmail.join(", ")}\n`
    )
  } else {
    console.log(
      "No table exposes an email column to this role — enrichment needs one to match on.\n"
    )
  }
} finally {
  await sql.end()
}
