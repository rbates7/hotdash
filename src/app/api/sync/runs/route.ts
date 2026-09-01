import { z } from "zod"

import { jsonError } from "@/lib/core/http"
import { getDb } from "@/lib/db/client"
import { listRuns } from "@/lib/sync/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({
  source: z.enum(["gmail", "stripe", "supabase"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = querySchema.parse(Object.fromEntries(searchParams))
    const runs = listRuns(getDb(), query.source, query.limit)
    return Response.json({ runs })
  } catch (error) {
    return jsonError(error, "Failed to list sync runs.")
  }
}
