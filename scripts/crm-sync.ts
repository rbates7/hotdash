/**
 * Run a sync through the running server, from the terminal.
 *
 *   pnpm crm:sync supabase
 *   pnpm crm:sync stripe
 *   pnpm crm:sync gmail
 *   pnpm crm:sync gmail --sent   # import mail you sent (once), cursor untouched
 *   pnpm crm:sync feedback
 *   pnpm crm:sync all        # stripe, supabase, feedback, then gmail
 *
 * Goes through the server rather than the database directly so the same
 * already-running guard, scheduler and run history apply as when the button
 * is clicked — this is the button, minus the browser.
 */
import { loadEnvLocal } from "./load-env"

loadEnvLocal()

const source = process.argv[2]
const sentOnly = process.argv.slice(3).includes("--sent")
const SOURCES = ["gmail", "stripe", "supabase", "feedback", "all"]
if (!source || !SOURCES.includes(source)) {
  console.error(`Usage: pnpm crm:sync <${SOURCES.join("|")}> [--sent]`)
  process.exit(2)
}
if (sentOnly && source !== "gmail") {
  console.error("--sent only applies to gmail.")
  process.exit(2)
}

const port = process.env.PORT ?? "3000"
const origin = `http://localhost:${port}`

async function main() {
  let response: Response
  try {
    response = await fetch(`${origin}/api/crm/sync/${source}${sentOnly ? "?sent=1" : ""}`, {
      method: "POST",
      // The CSRF check on /api/crm/* wants a same-origin Origin header.
      headers: { Origin: origin },
    })
  } catch {
    console.error(`No server answering at ${origin}. Start it: pnpm crm:restart`)
    process.exit(1)
  }

  const payload = (await response.json()) as
    | { error?: string; status?: string; message?: string | null; stats?: Record<string, number> | null }
    | { results: { source: string; status: string; message?: string | null; stats?: Record<string, number> | null }[] }

  if (!response.ok) {
    console.error(`Sync failed: ${"error" in payload ? payload.error : response.statusText}`)
    process.exit(1)
  }

  const runs = "results" in payload ? payload.results : [{ source, ...payload }]
  let failed = false
  for (const run of runs) {
    const status = run.status ?? "unknown"
    const stats = run.stats
      ? Object.entries(run.stats).map(([k, v]) => `${k} ${v}`).join(", ")
      : ""
    console.log(`${run.source.padEnd(9)} ${status.padEnd(8)} ${run.message ?? stats}`)
    if (status === "error") failed = true
  }
  process.exit(failed ? 1 : 0)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
