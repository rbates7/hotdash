import { z } from "zod"

import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { searchAll } from "@/lib/crm/search/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const querySchema = z.object({ q: z.string().max(200).default("") })

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const { q } = querySchema.parse(Object.fromEntries(searchParams))
    const results = await searchAll(getDb(), q)
    return Response.json(results)
  } catch (error) {
    return jsonError(error, "Search failed.")
  }
}
