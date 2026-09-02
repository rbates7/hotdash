import { z } from "zod"

import {
  setContactReachedOut,
  updateContactManual,
} from "@/lib/crm/contacts/server"
import { jsonError } from "@/lib/crm/core/http"
import { getDb } from "@/lib/crm/db/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  firstName: z.string().max(200).nullable().optional(),
  lastName: z.string().max(200).nullable().optional(),
  organizationName: z.string().max(200).nullable().optional(),
  /** Tick or untick "reached out" (the Overview's new / churned lists). */
  reachedOut: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { reachedOut, ...manual } = bodySchema.parse(await request.json())
    const db = getDb()
    let contact =
      reachedOut === undefined || Object.keys(manual).length > 0
        ? updateContactManual(db, id, manual)
        : null
    if (reachedOut !== undefined) {
      contact = setContactReachedOut(db, id, reachedOut)
    }
    return Response.json({ contact })
  } catch (error) {
    return jsonError(error, "Failed to update the contact.")
  }
}
