#!/usr/bin/env node
/**
 * Fails the build if a server secret could reach a browser: the Stripe key
 * (`STRIPE_READONLY_KEY`), Chlk's read-only database URL
 * (`SUPABASE_READONLY_DB_URL`, which carries a password) or the PostHog
 * personal API key (`POSTHOG_PERSONAL_API_KEY`).
 *
 * Scans everything Next serves to clients — `.next/static` (every JS/CSS
 * chunk) and the prerendered pages and RSC payloads under
 * `.next/server/app` — for:
 *   1. each env var's name (client code must not even know it exists), and
 *   2. each value, when one is set in this process's environment.
 *
 * CI builds with dummies and runs this with the same dummies, so a leak of
 * a value is caught without a real secret anywhere near CI. Values are
 * never printed: a hit names the file and what it found.
 *
 * Usage: node scripts/check-client-bundle.mjs [buildDir=.next]
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const ENV_NAMES = ["STRIPE_READONLY_KEY", "SUPABASE_READONLY_DB_URL", "POSTHOG_PERSONAL_API_KEY"]
const buildDir = path.resolve(process.argv[2] ?? ".next")
const staticDir = path.join(buildDir, "static")
const prerenderDir = path.join(buildDir, "server", "app")
/** Prerendered output a browser receives; server JS is allowed to name the var. */
const PRERENDERED = /\.(html|rsc|body|json|txt)$/

function* walk(dir, accept = () => true) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full, accept)
    else if (entry.isFile() && accept(full)) yield full
  }
}

try {
  if (!statSync(staticDir).isDirectory()) throw new Error()
} catch {
  console.error(`check-client-bundle: ${path.relative(process.cwd(), staticDir)} not found — run \`pnpm build\` first.`)
  process.exit(1)
}

const needles = []
const unset = []
for (const name of ENV_NAMES) {
  needles.push({ label: `the env var name ${name}`, bytes: Buffer.from(name) })
  const value = process.env[name]?.trim() ?? ""
  if (value.length >= 8) needles.push({ label: `${name}'s value`, bytes: Buffer.from(value) })
  else unset.push(name)
}

const files = [...walk(staticDir), ...walk(prerenderDir, (f) => PRERENDERED.test(f))]
const hits = []
for (const file of files) {
  const content = readFileSync(file)
  for (const needle of needles) {
    if (content.includes(needle.bytes)) hits.push(`${path.relative(process.cwd(), file)}: contains ${needle.label}`)
  }
}

if (hits.length > 0) {
  console.error("check-client-bundle: a server secret could reach the browser:")
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}

console.log(
  `check-client-bundle: ${files.length} client files clean of ${needles.map((n) => n.label).join(" and ")}` +
    (unset.length === 0 ? "." : ` (${unset.join(" and ")} not set here, so only the name was checked).`)
)
