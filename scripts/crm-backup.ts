import fs from "node:fs"

import Database from "better-sqlite3"

import { loadEnvLocal } from "./load-env"

// A copy of the CRM database as one consistent file, taken through SQLite's
// online backup so it is safe even with the server running. crm:restart
// takes one before every build (a build can carry a migration, and some
// migrations rebuild a table); run it by hand before anything you might
// want to undo.
//
//   pnpm crm:backup                  -> data/crm.db.bak
//   pnpm crm:backup data/before.db   -> wherever you say
//
// To go back to a backup: pnpm crm:stop, copy it over data/crm.db, delete
// data/crm.db-wal and data/crm.db-shm, then pnpm crm:restart.
async function main() {
  loadEnvLocal()
  const source = process.env.DATABASE_PATH ?? "./data/crm.db"
  const target = process.argv[2] ?? `${source}.bak`
  if (!fs.existsSync(source)) {
    console.log(`No database at ${source} yet; nothing to back up.`)
    return
  }
  const db = new Database(source)
  try {
    await db.backup(target)
  } finally {
    db.close()
  }
  const megabytes = (fs.statSync(target).size / 1024 / 1024).toFixed(1)
  console.log(`Backed up ${source} -> ${target} (${megabytes} MB)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
