import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import type { Page } from "@playwright/test"

import { liveDataPaths } from "../../scripts/shot-env.mjs"

/**
 * Write SHAS.txt next to a set of stills, so the folder records which
 * commit the pictures are of (#54 review). Stills stay on the box. The served commit is
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

/**
 * Second guard for screenshot specs (the first is playwright.config.ts
 * refusing a server whose env holds a secret): every /api/* call the spec
 * has not mocked goes to the server and is vetted. A body that looks live
 * (connected, stale, rows; see liveDataPaths) is replaced by a 503 so the
 * still never shows it, and recorded; call the returned check at the end of
 * the test to fail it. Register BEFORE the spec's own mocks: Playwright tries
 * the newest route first, so mocked paths never reach this one.
 */
export async function vetUnmockedApi(page: Page) {
  const leaks: string[] = []
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch()
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Not JSON: nothing structured to show.
    }
    const hits = liveDataPaths(body)
    if (hits.length > 0) {
      leaks.push(`${new URL(route.request().url()).pathname} ${hits.slice(0, 3).join(" ")}`)
      await route.fulfill({ status: 503, json: { error: "live data blocked in a screenshot run" } })
      return
    }
    await route.fulfill({ response })
  })
  return () => {
    if (leaks.length > 0) throw new Error(`live data reached a screenshot run: ${leaks.join("; ")}`)
  }
}
