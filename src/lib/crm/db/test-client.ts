import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"

import type { Db } from "./client"
import * as schema from "./schema"

export async function createTestDb(): Promise<{
  db: Db
  close: () => Promise<void>
}> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: "drizzle/crm" })
  return {
    db,
    close: () => client.close(),
  }
}
