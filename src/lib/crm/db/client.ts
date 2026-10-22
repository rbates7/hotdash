import type { PgDatabase } from "drizzle-orm/pg-core"
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres, { type Sql } from "postgres"

import * as schema from "./schema"

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const globalStore = globalThis as unknown as {
  __hotdashCrmDb?: { db: Db; client: Sql; url: string }
}

export function createDb(url: string): { db: Db; client: Sql } {
  const client = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return { db: drizzle(client, { schema }), client }
}

export function getDb(): Db {
  const url =
    process.env.CRM_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      "CRM database is not configured. Set CRM_DATABASE_URL or DATABASE_URL and run the CRM migrations."
    )
  }
  // Lazy initialization lets builds import CRM modules without credentials.
  if (!globalStore.__hotdashCrmDb || globalStore.__hotdashCrmDb.url !== url) {
    const { db, client } = createDb(url)
    globalStore.__hotdashCrmDb = { db, client, url }
  }
  return globalStore.__hotdashCrmDb.db
}
