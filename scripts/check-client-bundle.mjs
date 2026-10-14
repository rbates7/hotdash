#!/usr/bin/env node
/**
 * Fails the build if the Stripe key could reach a browser.
 *
 * Scans everything Next serves to clients — `.next/static` (every JS/CSS
 * chunk) and the prerendered pages and RSC payloads under
 * `.next/server/app` — for:
 *   1. the env var name `STRIPE_READONLY_KEY` (client code must not even
 *      know it exists), and
 *   2. the key's value, when one is set in this process's environment.
 *
 * CI builds with a dummy key and runs this with the same dummy, so a leak
 * of the value is caught without a real key anywhere near CI. The key is
 * never printed: a hit names the file and which of the two it found.
 *
 * Usage: node scripts/check-client-bundle.mjs [buildDir=.next]
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const ENV_NAME = "STRIPE_READONLY_KEY"
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

const key = process.env[ENV_NAME]?.trim() ?? ""
const needles = [{ label: `the env var name ${ENV_NAME}`, bytes: Buffer.from(ENV_NAME) }]
if (key.length >= 8) needles.push({ label: "the key's value", bytes: Buffer.from(key) })

const files = [...walk(staticDir), ...walk(prerenderDir, (f) => PRERENDERED.test(f))]
const hits = []
for (const file of files) {
  const content = readFileSync(file)
  for (const needle of needles) {
    if (content.includes(needle.bytes)) hits.push(`${path.relative(process.cwd(), file)}: contains ${needle.label}`)
  }
}

if (hits.length > 0) {
  console.error("check-client-bundle: the Stripe key could reach the browser:")
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}

console.log(
  `check-client-bundle: ${files.length} client files clean of ${needles.map((n) => n.label).join(" and ")}` +
    (key ? "." : ` (no ${ENV_NAME} set here, so only the name was checked).`)
)
