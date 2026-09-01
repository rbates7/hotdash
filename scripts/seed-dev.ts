import { createDb } from "../src/lib/db/client"
import { seed } from "./seed-common"

const file = process.env.DATABASE_PATH ?? "./data/hotdash.db"
const { db, sqlite } = createDb(file)
const stats = seed(db, sqlite, Date.now())
console.log(`Seeded ${file}:`, stats)
sqlite.close()
