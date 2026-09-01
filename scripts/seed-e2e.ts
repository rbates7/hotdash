import { createDb } from "../src/lib/db/client"
import { seed } from "./seed-common"

// Deterministic timestamp so e2e assertions on relative dates are stable.
const E2E_NOW = Date.parse("2026-09-01T12:00:00Z")

const file = process.env.DATABASE_PATH ?? "./.tmp/e2e.db"
const { db, sqlite } = createDb(file)
const stats = seed(db, sqlite, E2E_NOW)
console.log(`Seeded ${file} (e2e):`, stats)
sqlite.close()
