import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"

import * as schema from "./schema"

export type Db = BetterSQLite3Database<typeof schema>

const rawClients = new WeakMap<Db, Database.Database>()

// The underlying better-sqlite3 handle, for the rare statement drizzle can't
// express (e.g. UPDATE … RETURNING on the counters table).
export function rawClient(db: Db): Database.Database {
  const sqlite = rawClients.get(db)
  if (!sqlite) throw new Error("Unknown db instance.")
  return sqlite
}

const globalStore = globalThis as unknown as {
  __hotdashDb?: { db: Db; sqlite: Database.Database; path: string }
}

function databasePath() {
  return process.env.DATABASE_PATH ?? "./data/hotdash.db"
}

export function createDb(filename: string): {
  db: Db
  sqlite: Database.Database
} {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
  }
  const sqlite = new Database(filename)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  })
  // The case-number counter must exist before the first case is created.
  sqlite
    .prepare("INSERT OR IGNORE INTO counters (id, value) VALUES ('case', 0)")
    .run()
  rawClients.set(db, sqlite)
  return { db, sqlite }
}

export function getDb(): Db {
  const file = databasePath()
  // Survives dev HMR; re-opens if DATABASE_PATH changes (tests).
  if (!globalStore.__hotdashDb || globalStore.__hotdashDb.path !== file) {
    const { db, sqlite } = createDb(file)
    globalStore.__hotdashDb = { db, sqlite, path: file }
  }
  return globalStore.__hotdashDb.db
}
