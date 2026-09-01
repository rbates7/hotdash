import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { runSync } from "@/lib/crm/sync/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  source: z.enum(["gmail", "stripe", "supabase", "all"]),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  try {
    const { source } = paramsSchema.parse(await params)
    const db = getDb()
    if (source === "all") {
      const results = await Promise.all([
        runSync(db, "gmail", "manual"),
        runSync(db, "stripe", "manual"),
        runSync(db, "supabase", "manual"),
      ])
      return Response.json({ results })
    }
    const result = await runSync(db, source, "manual")
    return Response.json(result)
  } catch (error) {
    return jsonError(error, "Failed to run sync.")
  }
}
