import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { resetGmailCursor } from "@/lib/crm/gmail/sync"
import { runSync } from "@/lib/crm/sync/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  source: z.enum(["gmail", "stripe", "supabase", "feedback", "all"]),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  try {
    const { source } = paramsSchema.parse(await params)
    const db = getDb()

    // ?full=1 re-runs the backfill from GMAIL_INITIAL_SYNC_WINDOW. Ordinary
    // syncs resume from the stored history cursor, which means a widened
    // window is otherwise never read again after the first successful sync.
    if (source === "gmail" && new URL(request.url).searchParams.has("full")) {
      resetGmailCursor(db)
    }
    if (source === "all") {
      // Order matters, and it is not cosmetic: Gmail only opens a case when
      // the sender is already a known contact, so it must run *after* the
      // sources that create contacts. Run it first — or in parallel — and a
      // whole customer base lands in triage instead of becoming cases.
      // Sequential also keeps SQLite's single writer uncontended.
      const results = []
      for (const source of ["stripe", "supabase", "feedback", "gmail"] as const) {
        results.push({ source, ...(await runSync(db, source, "manual")) })
      }
      return Response.json({ results })
    }
    const result = await runSync(db, source, "manual")
    return Response.json(result)
  } catch (error) {
    return jsonError(error, "Failed to run sync.")
  }
}
