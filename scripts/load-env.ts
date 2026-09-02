/**
 * Loads .env.local into process.env for scripts run through tsx.
 *
 * Next.js reads .env.local itself; a bare `tsx script.ts` does not. Without
 * this a script reports a key as missing while it sits configured in the file
 * three lines above the one it is complaining about.
 *
 * Values already in the environment win, so `FOO=x pnpm crm:plans` overrides.
 */
import fs from "node:fs"
import path from "node:path"

export function loadEnvLocal(file = ".env.local"): Record<string, string> {
  const resolved = path.resolve(file)
  const parsed: Record<string, string> = {}
  if (!fs.existsSync(resolved)) return parsed

  for (const line of fs.readFileSync(resolved, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2]!.trim().replace(/^["']|["']$/g, "")
    parsed[match[1]!] = value
    if (process.env[match[1]!] === undefined) process.env[match[1]!] = value
  }
  return parsed
}
