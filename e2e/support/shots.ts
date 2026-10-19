import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/**
 * Write SHAS.txt next to a set of stills, so the proof branch records which
 * commit the pictures are of (#54 review). The served commit is
 * SHOT_SERVER_SHA when a script serves another checkout (a base built
 * elsewhere), else this checkout's HEAD; SHOT_BASE_SHA names the before
 * base when there is one. Idempotent: every worker writes the same text.
 */
export function writeShotShas(outDir: string, label: string) {
  let head = "unknown"
  try {
    head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  } catch {
    // Not a git checkout: say so rather than fail the shots.
  }
  const lines = [
    `${label}`,
    `served ${process.env.SHOT_SERVER_SHA ?? head}`,
    `spec checkout ${head}`,
    ...(process.env.SHOT_BASE_SHA ? [`base (develop) ${process.env.SHOT_BASE_SHA}`] : []),
    `build ${process.env.SHOT_BUILD ?? "production (next build && next start); nextjs-portal not hidden"}`,
  ]
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, "SHAS.txt"), `${lines.join("\n")}\n`)
}
