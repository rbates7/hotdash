import { defineConfig } from "drizzle-kit"

const databaseUrl =
  process.env.CRM_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim()

if (!databaseUrl && process.argv.includes("migrate")) {
  throw new Error(
    "CRM_DATABASE_URL or DATABASE_URL is required to apply CRM migrations."
  )
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/crm/db/schema.ts",
  out: "./drizzle/crm",
  dbCredentials: {
    url: databaseUrl ?? "postgres://unused:unused@localhost/unused",
  },
  strict: true,
  verbose: true,
})
