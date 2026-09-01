import { z } from "zod"

import {
  setCasePriority,
  setCaseStatus,
} from "@/lib/cases/server"
import { jsonError } from "@/lib/core/http"
import { getDb } from "@/lib/db/client"
import { CASE_PRIORITIES, CASE_STATUSES } from "@/lib/db/schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = bodySchema.parse(await request.json())
    const db = getDb()
    let caseRow = null
    if (body.status) caseRow = setCaseStatus(db, id, body.status)
    if (body.priority) caseRow = setCasePriority(db, id, body.priority)
    return Response.json({ case: caseRow })
  } catch (error) {
    return jsonError(error, "Failed to update the case.")
  }
}
