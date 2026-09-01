import { createDb } from "../src/lib/crm/db/client"
import { seed } from "./seed-common"

const file = process.env.DATABASE_PATH ?? "./data/crm.db"
const { db, sqlite } = createDb(file)
const stats = seed(db, sqlite, Date.now())
console.log(`Seeded ${file}:`, stats)
sqlite.close()
