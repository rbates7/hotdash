// @ts-check
/**
 * CLI for scripts/shot-env.mjs, used by scripts/shot-server.sh:
 *   node scripts/shot-env-cli.mjs env PORT=3211   NUL-separated NAME=VALUE pairs for `env -i`
 *   node scripts/shot-env-cli.mjs check FILE      exit 1 if FILE (NAME=VALUE lines) holds a secret-like value
 */
import fs from "node:fs"

import { assertNoSecrets, parseEnvLines, serverEnv } from "./shot-env.mjs"

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === "env") {
    const env = serverEnv(process.env, parseEnvLines(args.join("\n")))
    process.stdout.write(Object.entries(env).map(([k, v]) => `${k}=${v}\0`).join(""))
  } else if (cmd === "check") {
    assertNoSecrets(parseEnvLines(fs.readFileSync(args[0] ?? "", "utf8")), args[0] ?? "")
  } else {
    throw new Error("usage: shot-env-cli.mjs env [NAME=VALUE…] | check FILE")
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
