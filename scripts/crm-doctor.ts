/**
 * Preflight for the CRM's first real run: checks .env.local before you spend
 * time in the Google console, and tells you exactly what is missing.
 *
 *   pnpm crm:doctor
 */
import fs from "node:fs"
import path from "node:path"

type Level = "ok" | "warn" | "fail"
const results: { level: Level; label: string; detail: string }[] = []
const add = (level: Level, label: string, detail: string) =>
  results.push({ level, label, detail })

// .env.local is not loaded outside Next, so read it directly.
const envPath = path.resolve(".env.local")
const env: Record<string, string> = { ...process.env } as Record<string, string>
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match) env[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, "")
  }
  add("ok", ".env.local", "found")
} else {
  add("fail", ".env.local", "missing — copy .env.example to .env.local")
}

const secret = env.APP_SECRET ?? ""
if (!secret) {
  add("fail", "APP_SECRET", "not set — run: openssl rand -hex 32")
} else if (secret.length < 32) {
  add(
    "fail",
    "APP_SECRET",
    `only ${secret.length} chars; needs 32+ (openssl rand -hex 32)`
  )
} else {
  add("ok", "APP_SECRET", `${secret.length} chars`)
}

const clientId = env.GOOGLE_CLIENT_ID ?? ""
const clientSecret = env.GOOGLE_CLIENT_SECRET ?? ""
if (!clientId || !clientSecret) {
  add("fail", "Google OAuth", "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set")
} else if (!clientId.endsWith(".apps.googleusercontent.com")) {
  add("warn", "Google OAuth", "client id does not look like a Google client id")
} else {
  add("ok", "Google OAuth", "client id and secret present")
}

// The redirect URI has to match the Google console entry character for
// character, and it moved under /api/crm during the port.
const redirect = env.GOOGLE_REDIRECT_URI ?? ""
const expectedPath = "/api/crm/google/callback"
if (!redirect) {
  add("warn", "Redirect URI", `not set — defaults to http://localhost:3000${expectedPath}`)
} else if (!redirect.endsWith(expectedPath)) {
  add(
    "fail",
    "Redirect URI",
    `must end with ${expectedPath} — got ${redirect}`
  )
} else {
  add("ok", "Redirect URI", redirect)
}

const stripe = env.STRIPE_API_KEY ?? ""
if (!stripe) {
  add("warn", "Stripe", "not set — customers and plans will not be imported")
} else if (stripe.startsWith("sk_")) {
  add(
    "warn",
    "Stripe",
    "this is a full secret key; a restricted key (rk_) with Customers+Subscriptions read is safer"
  )
} else if (stripe.startsWith("rk_")) {
  add("ok", "Stripe", "restricted key")
} else {
  add("warn", "Stripe", "key does not look like a Stripe key")
}

add(
  env.SUPABASE_DB_URL ? "ok" : "warn",
  "Supabase",
  env.SUPABASE_DB_URL
    ? "configured"
    : "not set — name/org/product enrichment stays off (optional)"
)

const dbPath = env.DATABASE_PATH ?? "./data/crm.db"
add(
  fs.existsSync(path.resolve(dbPath)) ? "ok" : "warn",
  "Database",
  fs.existsSync(path.resolve(dbPath))
    ? `${dbPath} exists`
    : `${dbPath} will be created on first run`
)

const icon = { ok: "✓", warn: "!", fail: "✗" }
console.log("\nCRM preflight\n")
for (const r of results) {
  console.log(`  ${icon[r.level]} ${r.label.padEnd(14)} ${r.detail}`)
}

const fails = results.filter((r) => r.level === "fail")
if (fails.length > 0) {
  console.log(
    `\n${fails.length} blocking issue${fails.length === 1 ? "" : "s"}. Gmail will not connect until fixed.\n`
  )
  process.exit(1)
}
console.log(
  "\nReady. Start the app, then in /crm/settings sync Stripe first, then connect Gmail.\n"
)
