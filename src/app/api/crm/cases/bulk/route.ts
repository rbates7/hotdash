import { z } from "zod"

import { setCaseStatusBulk } from "@/lib/crm/cases/server"
import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"
import { CASE_STATUSES } from "@/lib/crm/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Capped well under SQLite's bound-parameter limit; the list page never
// offers more than one page of cases to a single action anyway.
const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(CASE_STATUSES),
})

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    const updated = setCaseStatusBulk(getDb(), body.ids, body.status)
    return Response.json({ updated })
  } catch (error) {
    return jsonError(error, "Failed to update those cases.")
  }
}
